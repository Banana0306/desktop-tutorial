const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findUserByUsername, findUserById, updateLastLogin } = require('../db/users');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '請填寫帳號與密碼' });
  }

  const delay = () => new Promise(r => setTimeout(r, 200));

  try {
    const user = await findUserByUsername(username);

    if (!user) {
      await delay();
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await delay();
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    updateLastLogin(user.id);

    return res.json({
      token,
      user: {
        id:        user.id,
        username:  user.username,
        full_name: user.full_name,
        email:     user.email,
        role:      user.role,
      },
    });
  } catch (err) {
    console.error('登入錯誤:', err.message);
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: '使用者不存在' });
    return res.json({ user });
  } catch (err) {
    console.error('取得使用者資訊錯誤:', err.message);
    return res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  return res.json({ ok: true });
});

module.exports = router;
