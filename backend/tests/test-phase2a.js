const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const bcrypt = require('bcrypt');
const { query } = require('../src/db/index');
const app = require('../src/index');

let server;
let token;
let supplierId, productId, warehouseId, poId, grId, gr2Id;

async function req(method, path, body, tok) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

before(async () => {
  server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  // Create test user and login
  const hash = await bcrypt.hash('testpass123', 10);
  const u = await query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ('test_mgr_2a_' || $1, $2, '測試主管', 'manager', TRUE) RETURNING id`,
    [Date.now(), hash]
  );
  const loginRes = await req('POST', '/api/auth/login',
    { username: (await query('SELECT username FROM users WHERE id = $1', [u.rows[0].id])).rows[0].username,
      password: 'testpass123' });
  token = loginRes.body.token;

  // Create test warehouse
  const wRes = await query(
    `INSERT INTO warehouses (code, name, type) VALUES ($1, '測試倉', 'main') RETURNING id`,
    [`TW-${String(Date.now()).slice(-8)}`]
  );
  warehouseId = wRes.rows[0].id;
});

after(async () => {
  await query(`DELETE FROM purchase_return_items WHERE return_id IN (
    SELECT id FROM purchase_returns WHERE po_id IN (
      SELECT id FROM purchase_orders WHERE warehouse_id = $1
    ))`, [warehouseId]);
  await query(`DELETE FROM purchase_returns WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE warehouse_id = $1)`, [warehouseId]);
  await query(`DELETE FROM goods_receipt_items WHERE gr_id IN (
    SELECT id FROM goods_receipts WHERE warehouse_id = $1)`, [warehouseId]);
  await query('DELETE FROM goods_receipts WHERE warehouse_id = $1', [warehouseId]);
  await query(`DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE warehouse_id = $1)`, [warehouseId]);
  await query('DELETE FROM purchase_orders WHERE warehouse_id = $1', [warehouseId]);
  await query('DELETE FROM warehouses WHERE id = $1', [warehouseId]);
  if (supplierId) await query('DELETE FROM suppliers WHERE id = $1', [supplierId]);
  if (productId) await query('DELETE FROM products WHERE id = $1', [productId]);
  try { await query(`DELETE FROM users WHERE username LIKE 'test_mgr_2a_%'`); } catch {}
  await new Promise(resolve => server.close(resolve));
});

test('1. 建 supplier + product + 開 PO → 確認', async () => {
  const suffix = String(Date.now()).slice(-6);

  // Create supplier
  const sRes = await query(
    `INSERT INTO suppliers (code, name, country_code, currency_code, payment_terms)
     VALUES ($1, '泰國測試供應商', 'TH', 'THB', 30) RETURNING id`,
    [`TH-T-${suffix}`]
  );
  supplierId = sRes.rows[0].id;

  // Create product
  const pRes = await query(
    `INSERT INTO products (sku, name, unit, list_price, currency_code)
     VALUES ($1, '測試商品', '條', 2000, 'TWD') RETURNING id`,
    [`SKU-${suffix}`]
  );
  productId = pRes.rows[0].id;

  // Create PO
  const res = await req('POST', '/api/purchase-orders', {
    supplier_id:   supplierId,
    currency_code: 'THB',
    exchange_rate: 0.95,
    warehouse_id:  warehouseId,
    items: [{
      product_id:      productId,
      quantity:        100,
      unit_price_orig: 2000,
    }],
  }, token);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  poId = res.body.id;
  assert.equal(res.body.status, 'draft');

  // Confirm PO
  const confirmRes = await req('POST', `/api/purchase-orders/${poId}/confirm`, {}, token);
  assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
  assert.equal(confirmRes.body.status, 'confirmed');
});

test('2. 第一批 GR 收 60 條 → PO 推到 receiving', async () => {
  // Get PO items
  const poRes = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  const poItemId = poRes.body.items[0].id;

  const res = await req('POST', '/api/goods-receipts', {
    po_id:        poId,
    warehouse_id: warehouseId,
    exchange_rate: 0.95,
    items: [{
      product_id:      productId,
      po_item_id:      poItemId,
      quantity:        60,
      unit_price_orig: 2000,
    }],
  }, token);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  grId = res.body.id;

  // Complete GR
  const completeRes = await req('POST', `/api/goods-receipts/${grId}/complete`, {}, token);
  assert.equal(completeRes.status, 200);

  // Check PO status
  const poCheck = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  assert.equal(poCheck.body.status, 'receiving');
  assert.equal(Number(poCheck.body.items[0].received_quantity), 60);
});

test('3. 第二批 GR 收 40 條 → PO 推到 completed', async () => {
  const poRes = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  const poItemId = poRes.body.items[0].id;

  const res = await req('POST', '/api/goods-receipts', {
    po_id:        poId,
    warehouse_id: warehouseId,
    exchange_rate: 0.95,
    items: [{
      product_id:      productId,
      po_item_id:      poItemId,
      quantity:        40,
      unit_price_orig: 2000,
    }],
  }, token);
  assert.equal(res.status, 201);
  gr2Id = res.body.id;

  const completeRes = await req('POST', `/api/goods-receipts/${gr2Id}/complete`, {}, token);
  assert.equal(completeRes.status, 200);

  const poCheck = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  assert.equal(poCheck.body.status, 'completed');
  assert.equal(Number(poCheck.body.items[0].received_quantity), 100);
});

test('4. snapshot 驗證: 改商品名後舊 PO 仍顯示原品名', async () => {
  const originalSnapshot = await query(
    'SELECT product_snapshot FROM purchase_order_items WHERE po_id = $1', [poId]
  );
  const originalName = originalSnapshot.rows[0].product_snapshot.name;

  // Rename the product
  await query('UPDATE products SET name = $1 WHERE id = $2', ['改名後的商品', productId]);

  // Snapshot should still have original name
  const snapshotCheck = await query(
    'SELECT product_snapshot FROM purchase_order_items WHERE po_id = $1', [poId]
  );
  assert.equal(snapshotCheck.rows[0].product_snapshot.name, originalName);
  assert.notEqual(originalName, '改名後的商品');
});

test('5. 退貨流程: 從 GR 退 5 條 → PO returned_quantity 累加', async () => {
  const grItemRes = await query(
    'SELECT id FROM goods_receipt_items WHERE gr_id = $1', [grId]
  );
  const grItemId = grItemRes.rows[0].id;

  const res = await req('POST', '/api/purchase-returns', {
    gr_id:  grId,
    reason: '品質問題',
    items: [{
      product_id:      productId,
      gr_item_id:      grItemId,
      quantity:        5,
      unit_price_orig: 2000,
    }],
  }, token);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.status, 'completed');

  const poCheck = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  assert.equal(Number(poCheck.body.items[0].returned_quantity), 5);
});

test('6. 取消 GR → PO 退回 receiving 狀態', async () => {
  // Cancel second GR
  const cancelRes = await req('POST', `/api/goods-receipts/${gr2Id}/cancel`, {}, token);
  assert.equal(cancelRes.status, 200);

  const poCheck = await req('GET', `/api/purchase-orders/${poId}`, null, token);
  assert.equal(poCheck.body.status, 'receiving');
});
