const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'sales');

// GET /api/sales-orders
router.get('/', async (req, res) => {
  try {
    const { status, customer_id, date_from, date_to, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;

    if (status)      { conds.push(`so.status = $${idx++}`);      params.push(status); }
    if (customer_id) { conds.push(`so.customer_id = $${idx++}`); params.push(customer_id); }
    if (date_from)   { conds.push(`so.created_at >= $${idx++}`); params.push(date_from); }
    if (date_to)     { conds.push(`so.created_at < $${idx++}::date + 1`); params.push(date_to); }

    const where = conds.join(' AND ');
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const rows = await query(
      `SELECT so.*, c.name AS customer_name, c.tier AS customer_tier
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       WHERE ${where}
       ORDER BY so.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('取得銷售單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/sales-orders/:id
router.get('/:id', async (req, res) => {
  try {
    const soRes = await query(
      `SELECT so.*, c.name AS customer_name, c.tier, c.credit_limit
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       WHERE so.id = $1`,
      [req.params.id]
    );
    if (!soRes.rows[0]) return res.status(404).json({ error: '銷售單不存在' });

    const items = await query(
      `SELECT soi.*, p.name AS product_name, p.sku
       FROM sales_order_items soi
       JOIN products p ON p.id = soi.product_id
       WHERE soi.so_id = $1 ORDER BY soi.id`,
      [req.params.id]
    );
    res.json({ ...soRes.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/sales-orders
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { customer_id, currency_code, exchange_rate = 1, expected_delivery, notes, items } = req.body;
    if (!customer_id || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供客戶與銷售品項' });
    }

    const soNumber = await genDocNum(client, 'sales_orders', 'so_number', 'SO');
    let totalOrig = 0, totalTwd = 0;
    const processedItems = [];

    for (const item of items) {
      // Auto price calculation
      const priceRes = await client.query(
        'SELECT price_twd, price_source FROM get_customer_price($1, $2)',
        [customer_id, item.product_id]
      );
      const autoPrice  = item.unit_price_orig ?? Number(priceRes.rows[0].price_twd);
      const priceSrc   = item.unit_price_orig ? 'manual' : priceRes.rows[0].price_source;
      const subtotalOrig = item.quantity * autoPrice;
      const subtotalTwd  = subtotalOrig * exchange_rate;
      totalOrig += subtotalOrig;
      totalTwd  += subtotalTwd;

      const prodRes = await client.query('SELECT name, sku FROM products WHERE id = $1', [item.product_id]);
      processedItems.push({
        product_id:      item.product_id,
        product_snapshot: { name: prodRes.rows[0]?.name, sku: prodRes.rows[0]?.sku },
        quantity:        item.quantity,
        unit_price_orig: autoPrice,
        unit_price_twd:  autoPrice * exchange_rate,
        price_source:    priceSrc,
        subtotal_orig:   subtotalOrig,
        subtotal_twd:    subtotalTwd,
        notes:           item.notes || null,
      });
    }

    const soRes = await client.query(
      `INSERT INTO sales_orders (so_number, customer_id, status, currency_code, exchange_rate,
         total_amount_orig, total_amount_twd, expected_delivery, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [soNumber, customer_id, currency_code || 'TWD', exchange_rate,
       totalOrig, totalTwd, expected_delivery || null, notes || null, req.user.id]
    );
    const so = soRes.rows[0];

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sales_order_items (so_id, product_id, product_snapshot, quantity,
           unit_price_orig, unit_price_twd, price_source, subtotal_orig, subtotal_twd, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [so.id, item.product_id, JSON.stringify(item.product_snapshot),
         item.quantity, item.unit_price_orig, item.unit_price_twd, item.price_source,
         item.subtotal_orig, item.subtotal_twd, item.notes]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(so);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立銷售單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/sales-orders/:id/confirm
router.post('/:id/confirm', CAN_MODIFY, async (req, res) => {
  try {
    const soRes = await query(
      `SELECT so.*, c.credit_limit FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       WHERE so.id = $1`,
      [req.params.id]
    );
    if (!soRes.rows[0]) return res.status(404).json({ error: '銷售單不存在' });
    const so = soRes.rows[0];
    if (so.status !== 'draft') return res.status(400).json({ error: '只能確認草稿狀態的銷售單' });

    // Credit limit check
    if (Number(so.credit_limit) > 0) {
      const arRes = await query(
        `SELECT COALESCE(SUM(total_amount_twd), 0) AS ar_balance
         FROM sales_orders
         WHERE customer_id = $1 AND status NOT IN ('cancelled','completed') AND id != $2`,
        [so.customer_id, so.id]
      );
      const outstanding = Number(arRes.rows[0].ar_balance) + Number(so.total_amount_twd);
      if (outstanding > Number(so.credit_limit)) {
        if (!['owner', 'manager'].includes(req.user.role)) {
          return res.status(401).json({
            error: `超過信用額度 (NT$ ${so.credit_limit})，需要主管核准`,
            outstanding,
            credit_limit: so.credit_limit,
          });
        }
      }
    }

    const updated = await query(
      `UPDATE sales_orders SET status='confirmed', confirmed_at=NOW(), confirmed_by=$1
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/sales-orders/:id/cancel
router.post('/:id/cancel', CAN_MODIFY, async (req, res) => {
  try {
    const updated = await query(
      `UPDATE sales_orders SET status='cancelled', cancelled_at=NOW()
       WHERE id=$1 AND status IN ('draft','confirmed') RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: '銷售單不存在或無法取消' });
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
