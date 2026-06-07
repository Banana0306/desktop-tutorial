const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'warehouse');

// GET /api/sales-returns
router.get('/', async (req, res) => {
  try {
    const { sd_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (sd_id)  { conds.push(`sr.sd_id = $${idx++}`);  params.push(sd_id); }
    if (status) { conds.push(`sr.status = $${idx++}`); params.push(status); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT sr.*, c.name AS customer_name, sd.sd_number
       FROM sales_returns sr
       JOIN customers c ON c.id = sr.customer_id
       JOIN sales_deliveries sd ON sd.id = sr.sd_id
       WHERE ${conds.join(' AND ')}
       ORDER BY sr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/sales-returns
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { sd_id, reason, notes, items } = req.body;

    if (!sd_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供出貨單與退貨品項' });
    }

    const sdRes = await client.query(
      'SELECT * FROM sales_deliveries WHERE id = $1 AND status = $2', [sd_id, 'completed']
    );
    if (!sdRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '出貨單不存在或尚未完成' });
    }
    const sd = sdRes.rows[0];
    const returnNum = await genDocNum(client, 'sales_returns', 'return_number', 'SR');

    let totalTwd = 0;
    for (const item of items) totalTwd += item.quantity * item.unit_price_twd;

    const retRes = await client.query(
      `INSERT INTO sales_returns (return_number, sd_id, so_id, customer_id, status,
         return_date, total_amount_twd, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,'completed',CURRENT_DATE,$5,$6,$7,$8) RETURNING *`,
      [returnNum, sd_id, sd.so_id, sd.customer_id, totalTwd,
       reason || null, notes || null, req.user.id]
    );
    const ret = retRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO sales_return_items (return_id, sd_item_id, product_id, warehouse_id,
           quantity, unit_price_twd, subtotal_twd)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ret.id, item.sd_item_id, item.product_id,
         item.warehouse_id || null,
         item.quantity, item.unit_price_twd,
         item.quantity * item.unit_price_twd]
      );
    }

    // Update SO returned_quantity
    await client.query(
      `UPDATE sales_order_items soi
       SET returned_quantity = returned_quantity + (
         SELECT COALESCE(SUM(sri.quantity),0)
         FROM sales_return_items sri
         WHERE sri.return_id = $1 AND sri.sd_item_id IN (
           SELECT id FROM sales_delivery_items WHERE so_item_id = soi.id
         )
       )
       WHERE soi.so_id = $2`,
      [ret.id, sd.so_id]
    );

    await client.query('COMMIT');
    res.status(201).json(ret);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立銷退單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

async function genDocNum(client, table, col, prefix) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const r  = await client.query(
    `SELECT COUNT(*) + 1 AS seq FROM ${table} WHERE ${col} LIKE $1`, [`${prefix}-${ym}-%`]
  );
  return `${prefix}-${ym}-${String(r.rows[0].seq).padStart(4, '0')}`;
}

module.exports = router;
