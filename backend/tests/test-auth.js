const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../src/db/index');
const app = require('../src/index');

let server;
let BASE;
let TEST_USER = {
  username: 'test_owner_' + Date.now(),
  password: 'testpass123',
  full_name: '測試管理員',
  email: null,
};
let authToken;

async function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

before(async () => {
  // Start server on random port
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  BASE = `http://127.0.0.1:${server.address().port}`;

  // Create test user in DB
  const hash = await bcrypt.hash(TEST_USER.password, 10);
  await query(
    `INSERT INTO users (username, password_hash, full_name, email, role, is_active)
     VALUES ($1, $2, $3, $4, 'owner', TRUE)`,
    [TEST_USER.username, hash, TEST_USER.full_name, TEST_USER.email]
  );
});

after(async () => {
  await query('DELETE FROM users WHERE username = $1', [TEST_USER.username]);
  await new Promise(resolve => server.close(resolve));
});

test('1. 正確帳密登入 → 200 + token', async () => {
  const res = await req('POST', '/api/auth/login', {
    username: TEST_USER.username,
    password: TEST_USER.password,
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token, '應有 token');
  assert.ok(res.body.user, '應有 user');
  assert.equal(res.body.user.username, TEST_USER.username);
  authToken = res.body.token;
});

test('2. 錯誤密碼 → 401', async () => {
  const res = await req('POST', '/api/auth/login', {
    username: TEST_USER.username,
    password: 'wrongpassword',
  });
  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('3. 不存在的 username → 401 (訊息與 #2 一致)', async () => {
  const res = await req('POST', '/api/auth/login', {
    username: 'nonexistent_user_xyz',
    password: 'anypassword',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, '帳號或密碼錯誤');
});

test('4. 沒帶 body → 400', async () => {
  const res = await req('POST', '/api/auth/login', {});
  assert.equal(res.status, 400);
});

test('5. /me 沒 token → 401', async () => {
  const res = await req('GET', '/api/auth/me', null, null);
  assert.equal(res.status, 401);
});

test('6. /me 假 token → 401', async () => {
  const res = await req('GET', '/api/auth/me', null, 'fake.token.here');
  assert.equal(res.status, 401);
});

test('7. /me 正確 token → 200', async () => {
  const res = await req('GET', '/api/auth/me', null, authToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.user);
  assert.equal(res.body.user.username, TEST_USER.username);
});

test('8. last_login_at 在登入後有更新', async () => {
  await req('POST', '/api/auth/login', {
    username: TEST_USER.username,
    password: TEST_USER.password,
  });
  await new Promise(r => setTimeout(r, 200));
  const dbRes = await query(
    'SELECT last_login_at FROM users WHERE username = $1',
    [TEST_USER.username]
  );
  assert.ok(dbRes.rows[0].last_login_at, 'last_login_at 應不為空');
});

test('9. 過期 token → 401', async () => {
  const expiredToken = jwt.sign(
    { id: 999, username: 'test', role: 'owner' },
    process.env.JWT_SECRET,
    { expiresIn: '0s' }
  );
  await new Promise(r => setTimeout(r, 100));
  const res = await req('GET', '/api/auth/me', null, expiredToken);
  assert.equal(res.status, 401);
});
