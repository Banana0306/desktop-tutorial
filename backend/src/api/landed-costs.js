const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'accounting');

// POST /api/goods-receipts/:id/calculate-taxes
router.post('/goods-receipts/:id/calculate-taxes', CAN_MODIFY, async (req, res) => {
  try {
    const { customs_exchange_rate } = req.body;

    // Update customs exchange rate if provided
    if (customs_exchange_rate) {
      await query(
        'UPDATE goods_receipts SET customs_exchange_rate=$1 WHERE id=$2',
        [customs_exchange_rate, req.params.id]
      );
    }

    const items = await query(
      'SELECT id FROM goods_receipt_items WHERE gr_id=$1', [req.params.id]
    );

    const results = [];
    for (const item of items.rows) {
      const r = await query(
        'SELECT * FROM calculate_taxes_for_gr_item($1, $2)',
        [item.id, customs_exchange_rate || null]
      );
      results.push({ gr_item_id: item.id, ...r.rows[0] });
    }
    res.json({ data: results });
  } catch (err) {
    console.error('計算稅費錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/goods-receipts/:id/landed-cost-components
router.post('/goods-receipts/:id/landed-cost-components', CAN_MODIFY, async (req, res) => {
  try {
    const { component_type, amount_twd, apply_to_all = true, apply_product_ids, description } = req.body;
    if (!component_type || !amount_twd) {
      return res.status(400).json({ error: '請提供成本類型與金額' });
    }
    const r = await query(
      `INSERT INTO landed_cost_components (gr_id, component_type, amount_twd, apply_to_all, apply_product_ids, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, component_type, amount_twd, apply_to_all,
       apply_product_ids || null, description || null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/goods-receipts/:id/landed-cost-components
router.get('/goods-receipts/:id/landed-cost-components', async (req, res) => {
  try {
    const r = await query(
      'SELECT * FROM landed_cost_components WHERE gr_id=$1 ORDER BY created_at', [req.params.id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/goods-receipts/:id/recalculate-landed-cost
router.post('/goods-receipts/:id/recalculate-landed-cost', CAN_MODIFY, async (req, res) => {
  try {
    const { allocation_method = 'value' } = req.body;
    await query('SELECT recalculate_landed_costs($1, $2)', [req.params.id, allocation_method]);

    // Return updated breakdown
    const r = await query(
      'SELECT * FROM v_import_cost_breakdown WHERE gr_id=$1', [req.params.id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('重算落地成本錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/goods-receipts/:id/finalize-landed-cost
router.post('/goods-receipts/:id/finalize-landed-cost', CAN_MODIFY, async (req, res) => {
  try {
    const { allocation_method = 'value' } = req.body;
    await query('SELECT recalculate_landed_costs($1, $2)', [req.params.id, allocation_method]);
    await query(
      `UPDATE goods_receipts SET landed_cost_status='finalized', allocation_method=$1 WHERE id=$2`,
      [allocation_method, req.params.id]
    );
    res.json({ ok: true, message: '落地成本已封存' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/goods-receipts/:id/cost-breakdown
router.get('/goods-receipts/:id/cost-breakdown', async (req, res) => {
  try {
    const r = await query('SELECT * FROM v_import_cost_breakdown WHERE gr_id=$1', [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
