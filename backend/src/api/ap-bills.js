const express = require('express');
const { query } = require('../db/index');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { status, supplier_id, page = 1, limit = 20 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let idx = 1;
    if (status)      { conds.push(`ap.status = $${idx++}`);      params.push(status); }
    if (supplier_id) { conds.push(`ap.supplier_id = $${idx++}`); params.push(supplier_id); }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const rows = await query(
      `SELECT ap.*, s.name AS supplier_name
       FROM ap_bills ap JOIN suppliers s ON s.id = ap.supplier_id
       WHERE ${conds.join(' AND ')} ORDER BY ap.due_date ASC
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
    const rows = await query('SELECT * FROM v_ap_aging ORDER BY days_overdue DESC');
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const apRes = await query(
      `SELECT ap.*, s.name AS supplier_name FROM ap_bills ap
       JOIN suppliers s ON s.id = ap.supplier_id WHERE ap.id = $1`,
      [req.params.id]
    );
    if (!apRes.rows[0]) return res.status(404).json({ error: '應付帳款不存在' });
    const allocs = await query(
      `SELECT apa.*, pay.payment_number, pay.payment_date
       FROM ap_payment_allocations apa JOIN ap_payments pay ON pay.id = apa.payment_id
       WHERE apa.bill_id = $1 AND apa.status = 'active'`,
      [req.params.id]
    );
    res.json({ ...apRes.rows[0], allocations: allocs.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
