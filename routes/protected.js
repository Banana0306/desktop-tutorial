const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

module.exports = router;
