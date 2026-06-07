const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const http   = require('http');
const { query } = require('../src/db/index');
const app  = require('../src/index');

let server, token;

async function req(method, path, body, tok) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: server.address().port,
      path, method,
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

before(async () => {
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const suffix = String(Date.now()).slice(-6);
  const hash = await bcrypt.hash('pass1234', 10);
  await query(`INSERT INTO users (username, password_hash, full_name, role, is_active)
               VALUES ($1,$2,'主管4','manager',TRUE)`, [`mgr4_${suffix}`, hash]);
  const loginRes = await req('POST', '/api/auth/login', { username: `mgr4_${suffix}`, password: 'pass1234' });
  token = loginRes.body.token;
});

after(async () => {
  await query(`DELETE FROM users WHERE username LIKE 'mgr4_%'`).catch(() => {});
  await new Promise(r => server.close(r));
});

test('1. 取得會計期間列表', async () => {
  const res = await req('GET', '/api/reports/accounting-periods', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  assert.ok(res.body.data.length >= 24, `應有 24 個期間，實際: ${res.body.data.length}`);

  const first = res.body.data[0];
  assert.equal(first.period_code, '2026-01', '第一個期間應為 2026-01');
  const last = res.body.data[res.body.data.length - 1];
  assert.equal(last.period_code, '2027-12', '最後一個期間應為 2027-12');
  console.log(`  共 ${res.body.data.length} 個會計期間`);
});

test('2. 毛利報表 (無交易時返回零值)', async () => {
  const res = await req('GET', '/api/reports/gross-profit?start=2020-01-01&end=2020-12-31', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  assert.ok(res.body.data.length >= 6, `應有至少 6 個指標行，實際: ${res.body.data.length}`);

  const metrics = res.body.data.map(r => r.metric);
  assert.ok(metrics.includes('營業收入'), '應包含營業收入');
  assert.ok(metrics.includes('毛利'), '應包含毛利');
  console.log('  毛利報表指標:', metrics.join(', '));
});

test('3. 毛利報表缺少日期返回 400', async () => {
  const res = await req('GET', '/api/reports/gross-profit?start=2026-01-01', null, token);
  assert.equal(res.status, 400);
});

test('4. 商品分析報表 (含產品)', async () => {
  const res = await req('GET', '/api/reports/product-analysis?start=2020-01-01&end=2027-12-31', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  // products table should have items from previous tests
  console.log(`  商品分析: ${res.body.data.length} 個品項`);
  if (res.body.data.length > 0) {
    const first = res.body.data[0];
    assert.ok('product_id' in first, '應有 product_id');
    assert.ok('sku' in first, '應有 sku');
    assert.ok('margin_rate' in first, '應有 margin_rate');
  }
});

test('5. 庫存評價報表', async () => {
  const res = await req('GET', '/api/reports/inventory-valuation', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  庫存評價: ${res.body.data.length} 筆`);
});

test('6. 月銷售趨勢', async () => {
  const res = await req('GET', '/api/reports/monthly-sales-trend', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  月銷售趨勢: ${res.body.data.length} 個月份`);
});

test('7. 客戶獲利報表', async () => {
  const res = await req('GET', '/api/reports/customer-profitability', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  客戶獲利: ${res.body.data.length} 位客戶`);
});

test('8. 庫存進出報表 (可依期間篩選)', async () => {
  const res = await req('GET', '/api/reports/stock-inout-balance?period=2026-01', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  2026-01 庫存進出: ${res.body.data.length} 筆`);
});

test('9. 產生月度庫存快照', async () => {
  const res = await req('POST', '/api/reports/generate-monthly-snapshot', { period_code: '2026-01' }, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.message, '應有訊息');
  console.log(`  快照結果: ${res.body.message}`);
});

test('10. 月度快照產生後可查詢', async () => {
  const res = await req('GET', '/api/reports/monthly-snapshot/2026-01', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  2026-01 快照: ${res.body.data.length} 筆`);
});

test('11. period_code 格式驗證', async () => {
  const res = await req('POST', '/api/reports/generate-monthly-snapshot', { period_code: 'invalid' }, token);
  assert.equal(res.status, 400);
});

test('12. 客戶對帳單 (無效 ID 返回空陣列)', async () => {
  const res = await req('GET', '/api/reports/customer-statement/999999999', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  assert.equal(res.body.data.length, 0, '無效客戶應返回空陣列');
});
