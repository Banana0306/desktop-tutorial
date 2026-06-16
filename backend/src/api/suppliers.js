const express = require('express');
const { query } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager');

// GET /api/suppliers
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
      `SELECT id, code, name, name_en, country_code, currency_code,
              contact_person AS contact_name, phone, email, address, tax_id,
              payment_terms, status, created_at, updated_at
       FROM suppliers
       WHERE ${conds.join(' AND ')}
       ORDER BY id DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('取得供應商列表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, code, name, name_en, country_code, currency_code,
              contact_person AS contact_name, phone, email, address, tax_id,
              payment_terms, status
       FROM suppliers WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '供應商不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/suppliers
router.post('/', CAN_MODIFY, async (req, res) => {
  try {
    const { code, name, contact_name, phone, email, currency_code, payment_terms } = req.body;
    if (!code || !name) return res.status(400).json({ error: '請填寫代碼和名稱' });
    const result = await query(
      `INSERT INTO suppliers (code, name, contact_person, phone, email, currency_code, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, code, name, contact_person AS contact_name, phone, email, currency_code, payment_terms`,
      [code, name, contact_name || null, phone || null, email || null,
       currency_code || 'TWD', payment_terms || 30]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '供應商代碼已存在' });
    console.error('建立供應商錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', CAN_MODIFY, async (req, res) => {
  try {
    const { code, name, contact_name, phone, email, currency_code, payment_terms } = req.body;
    const result = await query(
      `UPDATE suppliers SET code=$1, name=$2, contact_person=$3, phone=$4, email=$5,
              currency_code=$6, payment_terms=$7, updated_at=NOW()
       WHERE id=$8 AND deleted_at IS NULL
       RETURNING id, code, name, contact_person AS contact_name, phone, email, currency_code, payment_terms`,
      [code, name, contact_name || null, phone || null, email || null,
       currency_code, payment_terms, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '供應商不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '供應商代碼已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
