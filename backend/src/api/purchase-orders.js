const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const CAN_MODIFY = requireRole('owner', 'manager');

// GET /api/purchase-orders
router.get('/', async (req, res) => {
  try {
    const {
      status, supplier_id, date_from, date_to,
      page = 1, limit = 20,
    } = req.query;

    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (status)      { conditions.push(`po.status = $${idx++}`);         params.push(status); }
    if (supplier_id) { conditions.push(`po.supplier_id = $${idx++}`);    params.push(supplier_id); }
    if (date_from)   { conditions.push(`po.created_at >= $${idx++}`);    params.push(date_from); }
    if (date_to)     { conditions.push(`po.created_at < $${idx++}::date + 1`); params.push(date_to); }

    const where = conditions.join(' AND ');
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rowsRes, countRes] = await Promise.all([
      query(
        `SELECT po.id, po.po_number, po.status, po.currency_code,
                po.exchange_rate, po.total_amount_orig, po.total_amount_twd,
                po.expected_delivery, po.created_at, po.updated_at,
                s.name AS supplier_name, s.code AS supplier_code
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         WHERE ${where}
         ORDER BY po.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM purchase_orders po WHERE ${where}`, params),
    ]);

    res.json({
      data:  rowsRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page:  parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('取得採購單列表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/purchase-orders/:id
router.get('/:id', async (req, res) => {
  try {
    const poRes = await query(
      `SELECT po.*, s.name AS supplier_name, s.currency_code AS supplier_currency
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1`,
      [req.params.id]
    );
    if (!poRes.rows[0]) return res.status(404).json({ error: '採購單不存在' });

    const itemsRes = await query(
      `SELECT poi.*, p.name AS product_name, p.sku
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       WHERE poi.po_id = $1
       ORDER BY poi.id`,
      [req.params.id]
    );

    res.json({ ...poRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('取得採購單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/purchase-orders
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { supplier_id, currency_code, exchange_rate = 1, expected_delivery, warehouse_id, notes, items } = req.body;

    if (!supplier_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供供應商與採購品項' });
    }

    const poNumber = await generateDocNumber(client, 'purchase_orders', 'po_number', 'PO');

    let totalOrig = 0, totalTwd = 0;
    const processedItems = items.map(item => {
      const subtotalOrig = item.quantity * item.unit_price_orig;
      const unitPriceTwd = item.unit_price_orig * exchange_rate;
      const subtotalTwd  = subtotalOrig * exchange_rate;
      totalOrig += subtotalOrig;
      totalTwd  += subtotalTwd;
      return { ...item, unit_price_twd: unitPriceTwd, subtotal_orig: subtotalOrig, subtotal_twd: subtotalTwd };
    });

    // Snapshot supplier & product names
    const supplierRes = await client.query('SELECT name, code FROM suppliers WHERE id = $1', [supplier_id]);

    const poRes = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, status, currency_code, exchange_rate,
         total_amount_orig, total_amount_twd, expected_delivery, warehouse_id, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [poNumber, supplier_id, currency_code || 'TWD', exchange_rate, totalOrig, totalTwd,
       expected_delivery || null, warehouse_id || null, notes || null, req.user.id]
    );
    const po = poRes.rows[0];

    for (const item of processedItems) {
      const prodRes = await client.query('SELECT name, sku FROM products WHERE id = $1', [item.product_id]);
      await client.query(
        `INSERT INTO purchase_order_items (po_id, product_id, product_snapshot, quantity,
           unit_price_orig, unit_price_twd, subtotal_orig, subtotal_twd, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [po.id, item.product_id,
         JSON.stringify({ name: prodRes.rows[0]?.name, sku: prodRes.rows[0]?.sku }),
         item.quantity, item.unit_price_orig, item.unit_price_twd,
         item.subtotal_orig, item.subtotal_twd, item.notes || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立採購單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// PUT /api/purchase-orders/:id
router.put('/:id', CAN_MODIFY, async (req, res) => {
  try {
    const poRes = await query('SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (!poRes.rows[0]) return res.status(404).json({ error: '採購單不存在' });
    if (poRes.rows[0].status !== 'draft') {
      return res.status(400).json({ error: '只能修改草稿狀態的採購單' });
    }
    const { notes, expected_delivery } = req.body;
    const updated = await query(
      `UPDATE purchase_orders SET notes=$1, expected_delivery=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [notes, expected_delivery, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/purchase-orders/:id/confirm
router.post('/:id/confirm', CAN_MODIFY, async (req, res) => {
  try {
    const poRes = await query('SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (!poRes.rows[0]) return res.status(404).json({ error: '採購單不存在' });
    if (poRes.rows[0].status !== 'draft') {
      return res.status(400).json({ error: '只能確認草稿狀態的採購單' });
    }
    const updated = await query(
      `UPDATE purchase_orders SET status='confirmed', confirmed_at=NOW(), confirmed_by=$1
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/purchase-orders/:id/cancel
router.post('/:id/cancel', CAN_MODIFY, async (req, res) => {
  try {
    const poRes = await query(
      `SELECT po.status, COUNT(gr.id) AS gr_count
       FROM purchase_orders po
       LEFT JOIN goods_receipts gr ON gr.po_id = po.id AND gr.status != 'cancelled'
       WHERE po.id = $1 GROUP BY po.status`,
      [req.params.id]
    );
    if (!poRes.rows[0]) return res.status(404).json({ error: '採購單不存在' });
    if (parseInt(poRes.rows[0].gr_count, 10) > 0) {
      return res.status(400).json({ error: '已有收貨記錄，無法取消' });
    }
    if (!['draft', 'confirmed'].includes(poRes.rows[0].status)) {
      return res.status(400).json({ error: '此狀態無法取消' });
    }
    const updated = await query(
      `UPDATE purchase_orders SET status='cancelled', cancelled_at=NOW(), cancelled_by=$1
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

async function generateDocNumber(client, table, column, prefix) {
  const ym  = new Date().toISOString().slice(0, 7).replace('-', '');
  const res = await client.query(
    `SELECT COUNT(*) + 1 AS seq FROM ${table} WHERE ${column} LIKE $1`,
    [`${prefix}-${ym}-%`]
  );
  return `${prefix}-${ym}-${String(res.rows[0].seq).padStart(4, '0')}`;
}

module.exports = router;
