const express = require('express');
const { query } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager');

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    const conds = ['deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (search) {
      conds.push(`(sku ILIKE $${idx} OR name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT id, sku, name, name_en, unit, list_price, cost_price, currency_code,
              weight_kg, min_stock_qty, reorder_point, status, (status = 'active') AS is_active,
              created_at, updated_at
       FROM products
       WHERE ${conds.join(' AND ')}
       ORDER BY id DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('取得商品列表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, sku, name, name_en, unit, list_price, cost_price, currency_code,
              weight_kg, min_stock_qty, reorder_point, status, (status = 'active') AS is_active
       FROM products WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '商品不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/products
router.post('/', CAN_MODIFY, async (req, res) => {
  try {
    const { sku, name, unit, list_price, weight_kg } = req.body;
    if (!sku || !name || list_price === undefined || list_price === null || list_price === '') {
      return res.status(400).json({ error: '請填寫必填欄位' });
    }
    const result = await query(
      `INSERT INTO products (sku, name, unit, list_price, weight_kg)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sku, name, unit, list_price, weight_kg, status, (status = 'active') AS is_active`,
      [sku, name, unit || '件', list_price, weight_kg || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU 已存在' });
    console.error('建立商品錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/products/:id
router.put('/:id', CAN_MODIFY, async (req, res) => {
  try {
    const { sku, name, unit, list_price, weight_kg } = req.body;
    const result = await query(
      `UPDATE products SET sku=$1, name=$2, unit=$3, list_price=$4, weight_kg=$5, updated_at=NOW()
       WHERE id=$6 AND deleted_at IS NULL
       RETURNING id, sku, name, unit, list_price, weight_kg, status, (status = 'active') AS is_active`,
      [sku, name, unit, list_price, weight_kg || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '商品不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU 已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PATCH /api/products/:id (toggle active status)
router.patch('/:id', CAN_MODIFY, async (req, res) => {
  try {
    const { is_active } = req.body;
    const result = await query(
      `UPDATE products SET status=$1, updated_at=NOW()
       WHERE id=$2 AND deleted_at IS NULL
       RETURNING id, sku, name, status, (status = 'active') AS is_active`,
      [is_active ? 'active' : 'inactive', req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '商品不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
