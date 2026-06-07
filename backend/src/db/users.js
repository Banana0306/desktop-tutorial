const { query } = require('./index');

async function findUserByUsername(username) {
  const res = await query(
    `SELECT id, username, password_hash, full_name, email, role, is_active, last_login_at
     FROM users
     WHERE username = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [username]
  );
  return res.rows[0] || null;
}

async function findUserById(id) {
  const res = await query(
    `SELECT id, username, full_name, email, role, is_active, last_login_at, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return res.rows[0] || null;
}

function updateLastLogin(userId) {
  query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [userId]
  ).catch(err => console.error('更新最後登入時間失敗:', err.message));
}

async function createUser({ username, password_hash, full_name, email, role }) {
  const res = await query(
    `INSERT INTO users (username, password_hash, full_name, email, role, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, username, full_name, email, role, created_at`,
    [username, password_hash, full_name, email, role]
  );
  return res.rows[0];
}

module.exports = { findUserByUsername, findUserById, updateLastLogin, createUser };
