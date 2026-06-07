const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'accounting');

router.get('/', async (req, res) => {
  try {
    const { supplier_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (supplier_id) { conds.push(`p.supplier_id = $${idx++}`); params.push(supplier_id); }
    if (status)      { conds.push(`p.status = $${idx++}`);      params.push(status); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT p.*, s.name AS supplier_name, pm.name AS payment_method_name
       FROM ap_payments p JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE ${conds.join(' AND ')} ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/ap-payments — create payment (draft)
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { supplier_id, payment_method_id, payment_date, currency_code, exchange_rate = 1,
            amount_orig, notes } = req.body;

    if (!supplier_id || !amount_orig) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請填寫供應商與金額' });
    }

    const ym  = new Date().toISOString().slice(0, 7).replace('-', '');
    const seq = (await client.query(
      `SELECT COUNT(*)+1 AS s FROM ap_payments WHERE payment_number LIKE $1`, [`PAY-${ym}-%`]
    )).rows[0].s;
    const payNum = `PAY-${ym}-${String(seq).padStart(4, '0')}`;

    const p = await client.query(
      `INSERT INTO ap_payments (payment_number, supplier_id, status, payment_method_id,
         payment_date, currency_code, exchange_rate, amount_orig, amount_twd, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [payNum, supplier_id, payment_method_id || null,
       payment_date || new Date().toISOString().slice(0, 10),
       currency_code || 'TWD', exchange_rate,
       amount_orig, amount_orig * exchange_rate,
       notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(p.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/ap-payments/:id/complete
router.post('/:id/complete', CAN_MODIFY, async (req, res) => {
  try {
    const check = await query('SELECT status FROM ap_payments WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: '付款單不存在' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ error: '只能完成草稿付款單' });

    const updated = await query(
      `UPDATE ap_payments SET status='completed', completed_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
