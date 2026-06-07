const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'warehouse');

// GET /api/goods-receipts
router.get('/', async (req, res) => {
  try {
    const { po_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (po_id)  { conds.push(`gr.po_id = $${idx++}`);  params.push(po_id); }
    if (status) { conds.push(`gr.status = $${idx++}`); params.push(status); }

    const where = conds.join(' AND ');
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const rows = await query(
      `SELECT gr.*, s.name AS supplier_name, w.name AS warehouse_name, po.po_number
       FROM goods_receipts gr
       JOIN suppliers s ON s.id = gr.supplier_id
       JOIN warehouses w ON w.id = gr.warehouse_id
       JOIN purchase_orders po ON po.id = gr.po_id
       WHERE ${where}
       ORDER BY gr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/goods-receipts/:id
router.get('/:id', async (req, res) => {
  try {
    const grRes = await query(
      `SELECT gr.*, s.name AS supplier_name, w.name AS warehouse_name, po.po_number
       FROM goods_receipts gr
       JOIN suppliers s ON s.id = gr.supplier_id
       JOIN warehouses w ON w.id = gr.warehouse_id
       JOIN purchase_orders po ON po.id = gr.po_id
       WHERE gr.id = $1`,
      [req.params.id]
    );
    if (!grRes.rows[0]) return res.status(404).json({ error: '收貨單不存在' });

    const items = await query(
      `SELECT gri.*, p.name AS product_name, p.sku
       FROM goods_receipt_items gri
       JOIN products p ON p.id = gri.product_id
       WHERE gri.gr_id = $1`,
      [req.params.id]
    );
    res.json({ ...grRes.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/goods-receipts
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { po_id, warehouse_id, received_date, exchange_rate = 1, notes, items } = req.body;

    if (!po_id || !warehouse_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供採購單、倉庫與收貨品項' });
    }

    const poRes = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1', [po_id]
    );
    if (!poRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '採購單不存在' });
    }
    if (!['confirmed', 'receiving'].includes(poRes.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '採購單狀態不允許收貨' });
    }

    const po = poRes.rows[0];
    const grNumber = await genDocNum(client, 'goods_receipts', 'gr_number', 'GR');

    let totalOrig = 0, totalTwd = 0;
    for (const item of items) {
      totalOrig += item.quantity * item.unit_price_orig;
      totalTwd  += item.quantity * item.unit_price_orig * exchange_rate;
    }

    const grRes = await client.query(
      `INSERT INTO goods_receipts (gr_number, po_id, supplier_id, warehouse_id, status,
         received_date, currency_code, exchange_rate, total_amount_orig, total_amount_twd,
         notes, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [grNumber, po_id, po.supplier_id, warehouse_id,
       received_date || new Date().toISOString().slice(0, 10),
       po.currency_code, exchange_rate, totalOrig, totalTwd,
       notes || null, req.user.id]
    );
    const gr = grRes.rows[0];

    for (const item of items) {
      const prodRes = await client.query('SELECT name, sku FROM products WHERE id = $1', [item.product_id]);
      await client.query(
        `INSERT INTO goods_receipt_items (gr_id, po_item_id, product_id, product_snapshot,
           quantity, unit_price_orig, unit_price_twd, subtotal_orig, subtotal_twd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [gr.id, item.po_item_id, item.product_id,
         JSON.stringify({ name: prodRes.rows[0]?.name, sku: prodRes.rows[0]?.sku }),
         item.quantity, item.unit_price_orig,
         item.unit_price_orig * exchange_rate,
         item.quantity * item.unit_price_orig,
         item.quantity * item.unit_price_orig * exchange_rate]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(gr);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立收貨單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/goods-receipts/:id/complete
router.post('/:id/complete', CAN_MODIFY, async (req, res) => {
  try {
    const grRes = await query('SELECT status FROM goods_receipts WHERE id = $1', [req.params.id]);
    if (!grRes.rows[0]) return res.status(404).json({ error: '收貨單不存在' });
    if (grRes.rows[0].status !== 'draft') {
      return res.status(400).json({ error: '只能完成草稿狀態的收貨單' });
    }
    const updated = await query(
      `UPDATE goods_receipts SET status='completed', completed_at=NOW(), completed_by=$1
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/goods-receipts/:id/cancel
router.post('/:id/cancel', CAN_MODIFY, async (req, res) => {
  try {
    const updated = await query(
      `UPDATE goods_receipts SET status='cancelled', cancelled_at=NOW()
       WHERE id=$1 AND status IN ('draft','completed')
       RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: '收貨單不存在或無法取消' });
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

async function genDocNum(client, table, col, prefix) {
  const ym  = new Date().toISOString().slice(0, 7).replace('-', '');
  const res = await client.query(
    `SELECT COUNT(*) + 1 AS seq FROM ${table} WHERE ${col} LIKE $1`,
    [`${prefix}-${ym}-%`]
  );
  return `${prefix}-${ym}-${String(res.rows[0].seq).padStart(4, '0')}`;
}

module.exports = router;
