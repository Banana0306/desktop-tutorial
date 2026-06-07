const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'warehouse');

// GET /api/sales-deliveries
router.get('/', async (req, res) => {
  try {
    const { so_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (so_id)  { conds.push(`sd.so_id = $${idx++}`);  params.push(so_id); }
    if (status) { conds.push(`sd.status = $${idx++}`); params.push(status); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT sd.*, c.name AS customer_name, so.so_number
       FROM sales_deliveries sd
       JOIN customers c ON c.id = sd.customer_id
       JOIN sales_orders so ON so.id = sd.so_id
       WHERE ${conds.join(' AND ')}
       ORDER BY sd.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/sales-deliveries/:id
router.get('/:id', async (req, res) => {
  try {
    const sdRes = await query(
      `SELECT sd.*, c.name AS customer_name, so.so_number
       FROM sales_deliveries sd
       JOIN customers c ON c.id = sd.customer_id
       JOIN sales_orders so ON so.id = sd.so_id
       WHERE sd.id = $1`,
      [req.params.id]
    );
    if (!sdRes.rows[0]) return res.status(404).json({ error: '出貨單不存在' });

    const items = await query(
      `SELECT sdi.*, p.name AS product_name, p.sku, w.name AS warehouse_name
       FROM sales_delivery_items sdi
       JOIN products p ON p.id = sdi.product_id
       JOIN warehouses w ON w.id = sdi.warehouse_id
       WHERE sdi.sd_id = $1`,
      [req.params.id]
    );
    res.json({ ...sdRes.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/sales-deliveries
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { so_id, delivery_date, notes, items } = req.body;

    if (!so_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供銷售單與出貨品項' });
    }

    const soRes = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1', [so_id]
    );
    if (!soRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: '銷售單不存在' }); }
    if (!['confirmed', 'delivering'].includes(soRes.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '銷售單狀態不允許出貨' });
    }

    const so = soRes.rows[0];
    const sdNumber = await genDocNum(client, 'sales_deliveries', 'sd_number', 'SD');

    const sdRes = await client.query(
      `INSERT INTO sales_deliveries (sd_number, so_id, customer_id, status, delivery_date, notes, created_by)
       VALUES ($1,$2,$3,'draft',$4,$5,$6) RETURNING *`,
      [sdNumber, so_id, so.customer_id,
       delivery_date || new Date().toISOString().slice(0, 10),
       notes || null, req.user.id]
    );
    const sd = sdRes.rows[0];

    for (const item of items) {
      const prodRes = await client.query('SELECT name, sku, list_price FROM products WHERE id = $1', [item.product_id]);
      await client.query(
        `INSERT INTO sales_delivery_items (sd_id, so_item_id, product_id, product_snapshot,
           warehouse_id, quantity, unit_price_twd, subtotal_twd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sd.id, item.so_item_id, item.product_id,
         JSON.stringify({ name: prodRes.rows[0]?.name, sku: prodRes.rows[0]?.sku }),
         item.warehouse_id, item.quantity,
         item.unit_price_twd || Number(prodRes.rows[0]?.list_price) || 0,
         item.quantity * (item.unit_price_twd || Number(prodRes.rows[0]?.list_price) || 0)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(sd);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立出貨單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/sales-deliveries/:id/complete
router.post('/:id/complete', CAN_MODIFY, async (req, res) => {
  try {
    const sdRes = await query('SELECT status FROM sales_deliveries WHERE id = $1', [req.params.id]);
    if (!sdRes.rows[0]) return res.status(404).json({ error: '出貨單不存在' });
    if (sdRes.rows[0].status !== 'draft') {
      return res.status(400).json({ error: '只能完成草稿狀態的出貨單' });
    }
    // Phase 2C will trigger FIFO here via trigger
    const updated = await query(
      `UPDATE sales_deliveries SET status='completed', completed_at=NOW(), completed_by=$1
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
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
