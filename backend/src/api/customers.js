const express = require('express');
const { query } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'sales');

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    const conds = ['deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (search) {
      conds.push(`(code ILIKE $${idx} OR name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT id, code, name, name_en, tier, country_code, currency_code,
              contact_person AS contact_name, phone, email, address, tax_id,
              credit_limit, payment_terms, status, created_at, updated_at
       FROM customers
       WHERE ${conds.join(' AND ')}
       ORDER BY id DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('取得客戶列表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, code, name, name_en, tier, country_code, currency_code,
              contact_person AS contact_name, phone, email, address, tax_id,
              credit_limit, payment_terms, status
       FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '客戶不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/customers
router.post('/', CAN_MODIFY, async (req, res) => {
  try {
    const { code, name, contact_name, phone, email, tier, credit_limit, payment_terms, currency_code } = req.body;
    if (!code || !name) return res.status(400).json({ error: '請填寫代碼和名稱' });
    const result = await query(
      `INSERT INTO customers (code, name, contact_person, phone, email, tier, credit_limit, payment_terms, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, code, name, contact_person AS contact_name, phone, email, tier, credit_limit, payment_terms, currency_code`,
      [code, name, contact_name || null, phone || null, email || null,
       tier || 'retail', credit_limit || 0, payment_terms || 30, currency_code || 'TWD']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '客戶代碼已存在' });
    console.error('建立客戶錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/customers/:id
router.put('/:id', CAN_MODIFY, async (req, res) => {
  try {
    const { code, name, contact_name, phone, email, tier, credit_limit, payment_terms, currency_code } = req.body;
    const result = await query(
      `UPDATE customers SET code=$1, name=$2, contact_person=$3, phone=$4, email=$5,
              tier=$6, credit_limit=$7, payment_terms=$8, currency_code=$9, updated_at=NOW()
       WHERE id=$10 AND deleted_at IS NULL
       RETURNING id, code, name, contact_person AS contact_name, phone, email, tier, credit_limit, payment_terms, currency_code`,
      [code, name, contact_name || null, phone || null, email || null,
       tier, credit_limit, payment_terms, currency_code, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '客戶不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '客戶代碼已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
