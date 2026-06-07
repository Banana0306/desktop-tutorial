const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function query(sql, params) {
  return pool.query(sql, params);
}

async function getClient() {
  return pool.connect();
}

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() AS now, version() AS version');
    console.log(`資料庫連線成功: ${res.rows[0].now}`);
    return true;
  } catch (err) {
    console.error('資料庫連線失敗:', err.message);
    return false;
  }
}

module.exports = { query, getClient, testConnection };
