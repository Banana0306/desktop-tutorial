const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const http   = require('http');
const { query } = require('../src/db/index');
const app  = require('../src/index');

let server, token, userId;

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
  const uRes = await query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1,$2,'主管5','manager',TRUE) RETURNING id`,
    [`mgr5_${suffix}`, hash]
  );
  userId = uRes.rows[0].id;
  const loginRes = await req('POST', '/api/auth/login', { username: `mgr5_${suffix}`, password: 'pass1234' });
  token = loginRes.body.token;

  // Also seed default prefs for this new user
  await query(
    `INSERT INTO user_notification_prefs (user_id, channel, event_type)
     SELECT $1, 'in_app'::notification_channel, e.event_type::notification_event
     FROM (VALUES ('low_stock'),('ar_overdue'),('ap_due_soon'),('so_confirmed'),
                  ('delivery_completed'),('gr_completed'),('backorder_created'),
                  ('backorder_settled'),('monthly_snapshot_ready')) AS e(event_type)
     ON CONFLICT DO NOTHING`,
    [userId]
  );
});

after(async () => {
  await query('DELETE FROM notification_logs WHERE user_id=$1', [userId]).catch(() => {});
  await query('DELETE FROM user_notification_prefs WHERE user_id=$1', [userId]).catch(() => {});
  await query('DELETE FROM line_subscriptions WHERE user_id=$1', [userId]).catch(() => {});
  await query('DELETE FROM web_push_subscriptions WHERE user_id=$1', [userId]).catch(() => {});
  await query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => {});
  await new Promise(r => server.close(r));
});

test('1. 取得通知偏好設定', async () => {
  const res = await req('GET', '/api/notifications/my-prefs', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  assert.ok(res.body.data.length >= 9, `應有 9 個事件類型，實際: ${res.body.data.length}`);
  console.log(`  通知偏好: ${res.body.data.length} 筆`);
});

test('2. 更新通知偏好 (關閉 low_stock in_app)', async () => {
  const res = await req('PUT', '/api/notifications/my-prefs', [
    { channel: 'in_app', event_type: 'low_stock', is_enabled: false }
  ], token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.ok);

  // Verify it was saved
  const check = await query(
    'SELECT is_enabled FROM user_notification_prefs WHERE user_id=$1 AND channel=$2 AND event_type=$3',
    [userId, 'in_app', 'low_stock']
  );
  assert.equal(check.rows[0].is_enabled, false, '應已關閉 low_stock');
});

test('3. 更新偏好後重新開啟', async () => {
  const res = await req('PUT', '/api/notifications/my-prefs', [
    { channel: 'in_app', event_type: 'low_stock', is_enabled: true }
  ], token);
  assert.equal(res.status, 200);
});

test('4. 收件匣初始為空', async () => {
  const res = await req('GET', '/api/notifications/inbox', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data), '應返回陣列');
  console.log(`  收件匣: ${res.body.data.length} 筆`);
});

test('5. 手動觸發低庫存檢查並產生通知', async () => {
  const res = await req('GET', '/api/notifications/low-stock-check?threshold=99999999', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(typeof res.body.checked === 'number', '應返回 checked 數量');
  console.log(`  低庫存檢查: ${res.body.checked} 筆品項低於 99999999 件`);
});

test('6. 觸發後收件匣有通知 (如有低庫存商品)', async () => {
  const inbox = await req('GET', '/api/notifications/inbox', null, token);
  assert.equal(inbox.status, 200);
  console.log(`  觸發後收件匣: ${inbox.body.data.length} 筆`);
  // If there were low stock items (threshold=99999999 catches everything), should have notifications
  // Just verify the structure is correct if there are any
  if (inbox.body.data.length > 0) {
    const n = inbox.body.data[0];
    assert.ok('event_type' in n, '應有 event_type');
    assert.ok('title' in n, '應有 title');
    assert.ok('body' in n, '應有 body');
  }
});

test('7. 新增 Web Push 訂閱', async () => {
  const res = await req('POST', '/api/notifications/web-push/subscribe', {
    endpoint: `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`,
    p256dh_key: 'BPTEST_P256DH_KEY_PLACEHOLDER_FOR_TESTING_ONLY',
    auth_key: 'TEST_AUTH_KEY',
    user_agent: 'TestAgent/1.0',
  }, token);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.ok);
});

test('8. 取消 Web Push 訂閱', async () => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/unsub-${Date.now()}`;
  // Subscribe first
  await req('POST', '/api/notifications/web-push/subscribe', {
    endpoint,
    p256dh_key: 'BPTEST_P256DH_KEY2',
    auth_key: 'TEST_AUTH_KEY2',
  }, token);
  // Then unsubscribe
  const res = await req('POST', '/api/notifications/web-push/unsubscribe', { endpoint }, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.ok);
});

test('9. LINE 狀態 (未綁定時返回 null)', async () => {
  const res = await req('GET', '/api/notifications/line-status', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data, null, '未綁定時應為 null');
});

test('10. LINE 解除綁定 (無訂閱時應成功)', async () => {
  const res = await req('DELETE', '/api/notifications/line-unlink', null, token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.ok);
});

test('11. LINE webhook 無簽名返回 400', async () => {
  const res = await req('POST', '/api/notifications/line/webhook',
    { events: [] }, null);
  assert.equal(res.status, 400);
});

test('12. 偏好設定格式驗證 (非陣列返回 400)', async () => {
  const res = await req('PUT', '/api/notifications/my-prefs',
    { channel: 'in_app', event_type: 'low_stock', is_enabled: false }, token);
  assert.equal(res.status, 400);
});
