const express = require('express');
const { query } = require('../db/index');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/inventory/stock
router.get('/stock', async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (product_id)   { conds.push(`product_id = $${idx++}`);   params.push(product_id); }
    if (warehouse_id) { conds.push(`warehouse_id = $${idx++}`); params.push(warehouse_id); }

    const rows = await query(
      `SELECT * FROM v_stock_by_warehouse WHERE ${conds.join(' AND ')} ORDER BY product_name, warehouse_code`,
      params
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/inventory/overview
router.get('/overview', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_stock_overview ORDER BY product_name');
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/inventory/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_low_stock_alerts ORDER BY shortage DESC');
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/inventory/aging
router.get('/aging', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_aging_analysis ORDER BY days_in_stock DESC');
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/inventory/batches
router.get('/batches', async (req, res) => {
  try {
    const { product_id, warehouse_id, status } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (product_id)   { conds.push(`sb.product_id = $${idx++}`);   params.push(product_id); }
    if (warehouse_id) { conds.push(`sb.warehouse_id = $${idx++}`); params.push(warehouse_id); }
    if (status)       { conds.push(`sb.status = $${idx++}`);       params.push(status); }

    const rows = await query(
      `SELECT sb.*, p.name AS product_name, p.sku, w.name AS warehouse_name
       FROM stock_batches sb
       JOIN products p ON p.id = sb.product_id
       JOIN warehouses w ON w.id = sb.warehouse_id
       WHERE ${conds.join(' AND ')}
       ORDER BY sb.received_date ASC, sb.id ASC`,
      params
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
