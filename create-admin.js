// 建立管理員帳號 - 直接執行：node create-admin.js
require('dotenv').config({ path: require('path').join(__dirname, 'backend/.env') });
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
  console.log('\n=== 建立管理員帳號 ===\n');
  try {
    const hash = await bcrypt.hash('erp20261', 12);
    await pool.query(`DELETE FROM users WHERE username = 'admin1'`);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin1', hash, '系統管理員', 'owner', true]
    );
    const res = await pool.query(`SELECT id, username, role FROM users WHERE username='admin1'`);
    console.log('✅ 成功！帳號已建立：');
    console.log('   帳號：admin1');
    console.log('   密碼：erp20261');
    console.log('   角色：', res.rows[0].role);
    console.log('\n   請前往 http://localhost:3000 登入\n');
  } catch (err) {
    console.error('❌ 錯誤：', err.message);
  } finally {
    await pool.end();
  }
}

main();
