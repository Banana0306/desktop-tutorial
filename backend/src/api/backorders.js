const express = require('express');
const { query } = require('../db/index');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/backorders
router.get('/', async (req, res) => {
  try {
    const { status, product_id, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (status)     { conds.push(`bo.status = $${idx++}`);     params.push(status); }
    if (product_id) { conds.push(`bo.product_id = $${idx++}`); params.push(product_id); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT bo.*, p.name AS product_name, p.sku, w.name AS warehouse_name,
              sd.sd_number
       FROM backorders bo
       JOIN products p ON p.id = bo.product_id
       JOIN warehouses w ON w.id = bo.warehouse_id
       JOIN sales_delivery_items sdi ON sdi.id = bo.sd_item_id
       JOIN sales_deliveries sd ON sd.id = sdi.sd_id
       WHERE ${conds.join(' AND ')}
       ORDER BY bo.created_at ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
