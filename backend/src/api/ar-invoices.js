const express = require('express');
const { query } = require('../db/index');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { status, customer_id, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (status)      { conds.push(`ar.status = $${idx++}`);      params.push(status); }
    if (customer_id) { conds.push(`ar.customer_id = $${idx++}`); params.push(customer_id); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT ar.*, c.name AS customer_name
       FROM ar_invoices ar JOIN customers c ON c.id = ar.customer_id
       WHERE ${conds.join(' AND ')} ORDER BY ar.due_date ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.get('/aging', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM v_ar_aging ORDER BY days_overdue DESC');
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const arRes = await query(
      `SELECT ar.*, c.name AS customer_name FROM ar_invoices ar
       JOIN customers c ON c.id = ar.customer_id WHERE ar.id = $1`,
      [req.params.id]
    );
    if (!arRes.rows[0]) return res.status(404).json({ error: '發票不存在' });
    const allocs = await query(
      `SELECT ara.*, rec.receipt_number, rec.receipt_date
       FROM ar_receipt_allocations ara JOIN ar_receipts rec ON rec.id = ara.receipt_id
       WHERE ara.invoice_id = $1 AND ara.status = 'active'`,
      [req.params.id]
    );
    res.json({ ...arRes.rows[0], allocations: allocs.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
