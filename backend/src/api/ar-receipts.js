const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'accounting');

router.get('/', async (req, res) => {
  try {
    const { customer_id, status, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (customer_id) { conds.push(`r.customer_id = $${idx++}`); params.push(customer_id); }
    if (status)      { conds.push(`r.status = $${idx++}`);      params.push(status); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT r.*, c.name AS customer_name, pm.name AS payment_method_name
       FROM ar_receipts r JOIN customers c ON c.id = r.customer_id
       LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id
       WHERE ${conds.join(' AND ')} ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/ar-receipts — create receipt (draft)
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { customer_id, payment_method_id, receipt_date, currency_code, exchange_rate = 1,
            amount_orig, check_number, check_due_date, bank_name, notes } = req.body;

    if (!customer_id || !amount_orig) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請填寫客戶與金額' });
    }

    const ym  = new Date().toISOString().slice(0, 7).replace('-', '');
    const seq = (await client.query(
      `SELECT COUNT(*)+1 AS s FROM ar_receipts WHERE receipt_number LIKE $1`, [`RC-${ym}-%`]
    )).rows[0].s;
    const recNum = `RC-${ym}-${String(seq).padStart(4, '0')}`;

    const r = await client.query(
      `INSERT INTO ar_receipts (receipt_number, customer_id, status, payment_method_id,
         receipt_date, currency_code, exchange_rate, amount_orig, amount_twd,
         check_number, check_due_date, bank_name, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [recNum, customer_id, payment_method_id || null,
       receipt_date || new Date().toISOString().slice(0, 10),
       currency_code || 'TWD', exchange_rate,
       amount_orig, amount_orig * exchange_rate,
       check_number || null, check_due_date || null, bank_name || null,
       notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/ar-receipts/:id/complete — complete and auto-allocate
router.post('/:id/complete', CAN_MODIFY, async (req, res) => {
  try {
    const check = await query('SELECT status FROM ar_receipts WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: '收款單不存在' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ error: '只能完成草稿收款單' });

    const updated = await query(
      `UPDATE ar_receipts SET status='completed', completed_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/ar-receipts/:id/bounce — bounce a check
router.post('/:id/bounce', CAN_MODIFY, async (req, res) => {
  try {
    const check = await query('SELECT status FROM ar_receipts WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: '收款單不存在' });
    if (check.rows[0].status !== 'completed') return res.status(400).json({ error: '只能退回已完成的收款單' });

    const updated = await query(
      `UPDATE ar_receipts SET status='bounced', bounced_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
