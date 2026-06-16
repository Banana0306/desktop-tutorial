require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'ruicheng_erp',
  user:     process.env.DB_USER     || 'erp_user',
  password: process.env.DB_PASSWORD || 'erp_secure_2026',
});

async function main() {
  console.log('\n建立管理員帳號中...\n');
  try {
    const hash = await bcrypt.hash('erp20261', 12);
    await pool.query(`DELETE FROM users WHERE username = 'admin1'`);
    const res = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ($1, $2, '系統管理員', 'owner', TRUE) RETURNING id, username, role`,
      ['admin1', hash]
    );
    console.log('成功！');
    console.log('帳號：admin1');
    console.log('密碼：erp20261');
    console.log('ID  ：', res.rows[0].id);
  } catch (err) {
    console.error('錯誤：', err.message);
  } finally {
    await pool.end();
  }
}
main();
