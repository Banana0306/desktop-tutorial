const express = require('express');
const { query } = require('../db/index');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/warehouses
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, code, name, type, address, status
       FROM warehouses
       WHERE status = 'active'
       ORDER BY id`
    );
    res.json({ data: rows.rows });
  } catch (err) {
    console.error('取得倉庫列表錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
