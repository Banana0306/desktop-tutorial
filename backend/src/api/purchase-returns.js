const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'warehouse');

// GET /api/purchase-returns
router.get('/', async (req, res) => {
  try {
    const { gr_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (gr_id)  { conds.push(`pr.gr_id = $${idx++}`);  params.push(gr_id); }
    if (status) { conds.push(`pr.status = $${idx++}`); params.push(status); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT pr.*, s.name AS supplier_name, gr.gr_number
       FROM purchase_returns pr
       JOIN suppliers s ON s.id = pr.supplier_id
       JOIN goods_receipts gr ON gr.id = pr.gr_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/purchase-returns
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { gr_id, reason, notes, items } = req.body;

    if (!gr_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供收貨單與退貨品項' });
    }

    const grRes = await client.query(
      'SELECT * FROM goods_receipts WHERE id = $1 AND status = $2',
      [gr_id, 'completed']
    );
    if (!grRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '收貨單不存在或尚未完成' });
    }
    const gr = grRes.rows[0];
    const returnNum = await genDocNum(client, 'purchase_returns', 'return_number', 'PR');

    let totalOrig = 0, totalTwd = 0;
    for (const item of items) {
      totalOrig += item.quantity * item.unit_price_orig;
      totalTwd  += item.quantity * item.unit_price_orig * gr.exchange_rate;
    }

    const retRes = await client.query(
      `INSERT INTO purchase_returns (return_number, gr_id, po_id, supplier_id, warehouse_id,
         status, return_date, currency_code, exchange_rate, total_amount_orig, total_amount_twd,
         reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',CURRENT_DATE,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [returnNum, gr_id, gr.po_id, gr.supplier_id, gr.warehouse_id,
       gr.currency_code, gr.exchange_rate, totalOrig, totalTwd,
       reason || null, notes || null, req.user.id]
    );
    const ret = retRes.rows[0];

    for (const item of items) {
      const prodRes = await client.query('SELECT name, sku FROM products WHERE id = $1', [item.product_id]);
      await client.query(
        `INSERT INTO purchase_return_items (return_id, gr_item_id, product_id, product_snapshot,
           quantity, unit_price_orig, unit_price_twd, subtotal_orig, subtotal_twd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ret.id, item.gr_item_id, item.product_id,
         JSON.stringify({ name: prodRes.rows[0]?.name, sku: prodRes.rows[0]?.sku }),
         item.quantity, item.unit_price_orig,
         item.unit_price_orig * gr.exchange_rate,
         item.quantity * item.unit_price_orig,
         item.quantity * item.unit_price_orig * gr.exchange_rate]
      );
    }

    // Auto-confirm and complete return
    await client.query(
      `UPDATE purchase_returns SET status='completed', completed_at=NOW() WHERE id=$1`,
      [ret.id]
    );

    // Update PO returned_quantity
    await client.query(
      `UPDATE purchase_order_items poi
       SET returned_quantity = returned_quantity + (
         SELECT COALESCE(SUM(pri.quantity),0)
         FROM purchase_return_items pri
         WHERE pri.return_id = $1 AND pri.gr_item_id IN (
           SELECT id FROM goods_receipt_items WHERE po_item_id = poi.id
         )
       )
       WHERE poi.po_id = $2`,
      [ret.id, gr.po_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...ret, status: 'completed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立退貨單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
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
