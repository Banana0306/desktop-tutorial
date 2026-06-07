const express = require('express');
const { query } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_VIEW = requireRole('owner', 'manager', 'accounting', 'sales');

// GET /api/reports/gross-profit?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/gross-profit', CAN_VIEW, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '請提供 start 和 end 日期' });
    const r = await query('SELECT * FROM report_gross_profit($1, $2)', [start, end]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('毛利報表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/customer-statement/:customerId?period=YYYY-MM
router.get('/customer-statement/:customerId', CAN_VIEW, async (req, res) => {
  try {
    const { period } = req.query;
    const r = await query(
      'SELECT * FROM report_customer_statement($1, $2)',
      [req.params.customerId, period || null]
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('客戶對帳單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/product-analysis?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/product-analysis', CAN_VIEW, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '請提供 start 和 end 日期' });
    const r = await query('SELECT * FROM report_product_analysis($1, $2)', [start, end]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('商品分析報表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/import-shipment-pnl/:grId
router.get('/import-shipment-pnl/:grId', CAN_VIEW, async (req, res) => {
  try {
    const r = await query('SELECT * FROM report_import_shipment_pnl($1)', [req.params.grId]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('進口批次損益錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/stock-inout-balance?period=YYYY-MM&productId=&warehouseId=
router.get('/stock-inout-balance', CAN_VIEW, async (req, res) => {
  try {
    const { period, productId, warehouseId } = req.query;
    let sql = 'SELECT * FROM v_stock_inout_balance WHERE 1=1';
    const params = [];
    if (period)      { params.push(period);      sql += ` AND period_code = $${params.length}`; }
    if (productId)   { params.push(productId);   sql += ` AND product_id = $${params.length}`; }
    if (warehouseId) { params.push(warehouseId); sql += ` AND warehouse_id = $${params.length}`; }
    sql += ' ORDER BY period_code, product_id, warehouse_id';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('庫存進出報表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/customer-profitability
router.get('/customer-profitability', CAN_VIEW, async (req, res) => {
  try {
    const r = await query('SELECT * FROM v_customer_profitability ORDER BY revenue_twd DESC');
    res.json({ data: r.rows });
  } catch (err) {
    console.error('客戶獲利報表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/monthly-sales-trend
router.get('/monthly-sales-trend', CAN_VIEW, async (req, res) => {
  try {
    const r = await query('SELECT * FROM v_monthly_sales_trend');
    res.json({ data: r.rows });
  } catch (err) {
    console.error('月銷售趨勢錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/inventory-valuation?warehouseId=
router.get('/inventory-valuation', CAN_VIEW, async (req, res) => {
  try {
    const { warehouseId } = req.query;
    let sql = 'SELECT * FROM v_inventory_valuation WHERE qty > 0';
    const params = [];
    if (warehouseId) { params.push(warehouseId); sql += ` AND warehouse_id = $${params.length}`; }
    sql += ' ORDER BY value_twd DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('庫存評價報表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/reports/generate-monthly-snapshot  (owner/manager/accounting only)
router.post('/generate-monthly-snapshot', requireRole('owner', 'manager', 'accounting'), async (req, res) => {
  try {
    const { period_code } = req.body;
    if (!period_code || !/^\d{4}-\d{2}$/.test(period_code)) {
      return res.status(400).json({ error: '請提供正確的 period_code (YYYY-MM)' });
    }
    const r = await query('SELECT * FROM generate_monthly_inventory_snapshot($1)', [period_code]);
    res.json({ data: r.rows, message: `${period_code} 快照已產生，共 ${r.rows.length} 筆` });
  } catch (err) {
    console.error('月度快照產生錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/accounting-periods
router.get('/accounting-periods', CAN_VIEW, async (req, res) => {
  try {
    const r = await query('SELECT * FROM accounting_periods ORDER BY period_code');
    res.json({ data: r.rows });
  } catch (err) {
    console.error('會計期間錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/reports/monthly-snapshot/:periodCode
router.get('/monthly-snapshot/:periodCode', CAN_VIEW, async (req, res) => {
  try {
    const r = await query(
      `SELECT ims.*, p.sku, p.name AS product_name, w.code AS warehouse_code
       FROM inventory_monthly_snapshots ims
       JOIN products p ON p.id = ims.product_id
       JOIN warehouses w ON w.id = ims.warehouse_id
       WHERE ims.period_code = $1
       ORDER BY p.sku, w.code`,
      [req.params.periodCode]
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('月度快照查詢錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
