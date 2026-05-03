const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const USERS_FILE = path.join(__dirname, '../data/users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 12);
  users.push({ username, password: hash, createdAt: new Date().toISOString() });
  writeUsers(users);

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res
    .cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 3600000 })
    .status(201)
    .json({ token, username });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res
    .cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 3600000 })
    .json({ token, username });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token').json({ message: 'Logged out' });
});

module.exports = router;
