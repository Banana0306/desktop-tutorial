const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const http = require('http');
const { query } = require('../src/db/index');
const app = require('../src/index');

let server, token;
let productId, warehouseId, warehouse2Id, supplierId, customerId;
let batchAId, batchBId;
let sdItemId, sdId, soId;

async function req(method, path, body, tok) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path, method,
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
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

before(async () => {
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

  const suffix = String(Date.now()).slice(-6);
  const hash = await bcrypt.hash('pass1234', 10);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, $2, '測試用主管', 'manager', TRUE)`,
    [`mgr2c_${suffix}`, hash]
  );
  const loginRes = await req('POST', '/api/auth/login', { username: `mgr2c_${suffix}`, password: 'pass1234' });
  token = loginRes.body.token;

  // Create warehouse
  const wRes = await query(
    `INSERT INTO warehouses (code, name, type) VALUES ($1, 'FIFO主倉', 'main'), ($2, 'BOND倉', 'bonded') RETURNING id`,
    [`FW-${suffix}`, `FB-${suffix}`]
  );
  warehouseId  = wRes.rows[0].id;
  warehouse2Id = wRes.rows[1].id;

  // Create product
  const pRes = await query(
    `INSERT INTO products (sku, name, unit, list_price, reorder_point)
     VALUES ($1, 'FIFO測試輪胎', '條', 2000, 50) RETURNING id`,
    [`FIFO-${suffix}`]
  );
  productId = pRes.rows[0].id;

  // Create supplier and customer for full flow tests
  const sRes = await query(
    `INSERT INTO suppliers (code, name, currency_code) VALUES ($1, 'FIFO供應商', 'TWD') RETURNING id`,
    [`FS-${suffix}`]
  );
  supplierId = sRes.rows[0].id;

  const cRes = await query(
    `INSERT INTO customers (code, name, tier, credit_limit) VALUES ($1, 'FIFO客戶', 'dealer', 1000000) RETURNING id`,
    [`FC-${suffix}`]
  );
  customerId = cRes.rows[0].id;
});

after(async () => {
  // Clean up in order
  await query('DELETE FROM sales_cogs_adjustments WHERE sd_item_id IN (SELECT id FROM sales_delivery_items WHERE sd_id IN (SELECT id FROM sales_deliveries WHERE so_id IN (SELECT id FROM sales_orders WHERE customer_id = $1)))', [customerId]).catch(() => {});
  await query('DELETE FROM backorders WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM inventory_transactions WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM sales_return_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM sales_delivery_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM sales_deliveries WHERE so_id IN (SELECT id FROM sales_orders WHERE customer_id = $1)', [customerId]).catch(() => {});
  await query('DELETE FROM sales_order_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM sales_orders WHERE customer_id = $1', [customerId]).catch(() => {});
  await query('DELETE FROM goods_receipt_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM goods_receipts WHERE warehouse_id IN ($1, $2)', [warehouseId, warehouse2Id]).catch(() => {});
  await query('DELETE FROM purchase_order_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM purchase_orders WHERE supplier_id = $1', [supplierId]).catch(() => {});
  await query('DELETE FROM stock_batches WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM inventory_transfer_items WHERE product_id = $1', [productId]).catch(() => {});
  await query('DELETE FROM inventory_transfers WHERE from_warehouse IN ($1, $2)', [warehouseId, warehouse2Id]).catch(() => {});
  await query('DELETE FROM warehouses WHERE id IN ($1, $2)', [warehouseId, warehouse2Id]).catch(() => {});
  await query('DELETE FROM customers WHERE id = $1', [customerId]).catch(() => {});
  await query('DELETE FROM suppliers WHERE id = $1', [supplierId]).catch(() => {});
  await query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  await query(`DELETE FROM users WHERE username LIKE 'mgr2c_%'`).catch(() => {});
  await new Promise(r => server.close(r));
});

test('1. FIFO 充足庫存消耗 (批次A 30@1450 + 批次B 50@1529, 出 80)', async () => {
  // Create 2 batches manually
  const bA = await query(
    `INSERT INTO stock_batches (product_id, warehouse_id, received_date, quantity, remaining_qty, unit_cost_twd, status)
     VALUES ($1, $2, CURRENT_DATE - 10, 30, 30, 1450, 'active') RETURNING id`,
    [productId, warehouseId]
  );
  batchAId = bA.rows[0].id;

  const bB = await query(
    `INSERT INTO stock_batches (product_id, warehouse_id, received_date, quantity, remaining_qty, unit_cost_twd, status)
     VALUES ($1, $2, CURRENT_DATE - 5, 50, 50, 1529, 'active') RETURNING id`,
    [productId, warehouseId]
  );
  batchBId = bB.rows[0].id;

  // Create SO + SD and complete to trigger FIFO
  const soRes = await req('POST', '/api/sales-orders', {
    customer_id: customerId,
    items: [{ product_id: productId, quantity: 80, unit_price_orig: 2500 }],
  }, token);
  assert.equal(soRes.status, 201, JSON.stringify(soRes.body));
  soId = soRes.body.id;

  await req('POST', `/api/sales-orders/${soId}/confirm`, {}, token);

  const soDetail = await req('GET', `/api/sales-orders/${soId}`, null, token);
  const soItemId = soDetail.body.items[0].id;

  const sdRes = await req('POST', '/api/sales-deliveries', {
    so_id: soId,
    items: [{ product_id: productId, so_item_id: soItemId, warehouse_id: warehouseId, quantity: 80, unit_price_twd: 2500 }],
  }, token);
  assert.equal(sdRes.status, 201, JSON.stringify(sdRes.body));
  sdId = sdRes.body.id;

  // Complete SD → triggers FIFO
  const completeRes = await req('POST', `/api/sales-deliveries/${sdId}/complete`, {}, token);
  assert.equal(completeRes.status, 200, JSON.stringify(completeRes.body));

  // Verify COGS: 30×1450 + 50×1529 = 43500 + 76450 = 119950
  const sdDetail = await query(
    'SELECT sdi.cogs_twd, sdi.batch_consumption, sdi.id FROM sales_delivery_items sdi WHERE sdi.sd_id = $1',
    [sdId]
  );
  sdItemId = sdDetail.rows[0].id;
  const cogsValue = Number(sdDetail.rows[0].cogs_twd);
  assert.equal(cogsValue, 119950, `COGS 應為 119950，實際為 ${cogsValue}`);

  // Verify batch consumption has 2 entries
  const consumption = sdDetail.rows[0].batch_consumption;
  assert.ok(Array.isArray(consumption) && consumption.length === 2, '批次消耗應有 2 筆');

  // Verify batch A is depleted
  const bAStatus = await query('SELECT status, remaining_qty FROM stock_batches WHERE id = $1', [batchAId]);
  assert.equal(bAStatus.rows[0].status, 'depleted', '批次A 應已耗盡');

  // Verify batch B remaining = 0
  const bBStatus = await query('SELECT remaining_qty FROM stock_batches WHERE id = $1', [batchBId]);
  assert.equal(Number(bBStatus.rows[0].remaining_qty), 0, '批次B 剩餘應為 0');

  // Verify 2 sd_out transactions
  const txns = await query(
    `SELECT COUNT(*) AS cnt FROM inventory_transactions
     WHERE reference_doc_type = 'sd_item' AND reference_doc_id = $1 AND txn_type = 'sd_out'`,
    [sdItemId]
  );
  assert.equal(Number(txns.rows[0].cnt), 2, '應有 2 筆 sd_out 異動');
});

test('2. 庫存不足 → 建立 backorder (出 100 條，只有 0 條)', async () => {
  // Reset: add batches C (30) and D (50) for this test
  await query(
    `INSERT INTO stock_batches (product_id, warehouse_id, received_date, quantity, remaining_qty, unit_cost_twd, status)
     VALUES ($1, $2, CURRENT_DATE - 3, 30, 30, 1450, 'active'),
            ($1, $2, CURRENT_DATE - 1, 50, 50, 1529, 'active')`,
    [productId, warehouseId]
  );

  // New SO + SD for 100 units (only 80 in stock)
  const soRes = await req('POST', '/api/sales-orders', {
    customer_id: customerId,
    items: [{ product_id: productId, quantity: 100, unit_price_orig: 2500 }],
  }, token);
  const soId2 = soRes.body.id;
  await req('POST', `/api/sales-orders/${soId2}/confirm`, {}, token);

  const soDetail = await req('GET', `/api/sales-orders/${soId2}`, null, token);
  const soItemId2 = soDetail.body.items[0].id;

  const sdRes = await req('POST', '/api/sales-deliveries', {
    so_id: soId2,
    items: [{ product_id: productId, so_item_id: soItemId2, warehouse_id: warehouseId, quantity: 100, unit_price_twd: 2500 }],
  }, token);
  const sdId2 = sdRes.body.id;
  const sdDetail2BeforeComplete = await req('GET', `/api/sales-deliveries/${sdId2}`, null, token);
  const sdItemId2 = sdDetail2BeforeComplete.body.items[0].id;

  await req('POST', `/api/sales-deliveries/${sdId2}/complete`, {}, token);

  // Verify: 80 consumed (30×1450 + 50×1529 = 119950), 20 as backorder with estimated 1529
  const sdItems = await query(
    'SELECT cogs_twd, batch_consumption FROM sales_delivery_items WHERE id = $1', [sdItemId2]
  );
  const expectedCogs = 30 * 1450 + 50 * 1529 + 20 * 1529;  // 119950 + 30580 = 150530
  assert.equal(Number(sdItems.rows[0].cogs_twd), expectedCogs,
    `COGS 應為 ${expectedCogs}，實際 ${sdItems.rows[0].cogs_twd}`);

  // Verify backorder created
  const bo = await query(
    'SELECT * FROM backorders WHERE sd_item_id = $1 AND status = $2', [sdItemId2, 'pending']
  );
  assert.equal(bo.rows.length, 1, '應有 1 筆 pending backorder');
  assert.equal(Number(bo.rows[0].quantity), 20, 'Backorder 數量應為 20');
  assert.equal(Number(bo.rows[0].estimated_cost_twd), 1529, '暫估成本應為 1529');
});

test('3. 新進貨 GR 自動結算 backorder + COGS variance', async () => {
  // First confirm there's a pending backorder
  const bosBefore = await query(
    'SELECT * FROM backorders WHERE product_id = $1 AND status = $2', [productId, 'pending']
  );
  assert.ok(bosBefore.rows.length > 0, '應有 pending backorder');
  const bo = bosBefore.rows[0];
  const boQty = Number(bo.quantity);
  const boEstCost = Number(bo.estimated_cost_twd);

  // Create PO → GR with 50 units @ 1580
  const boPoNum = `PO-TEST-BO-${Date.now()}`;
  const poRes = await query(
    `INSERT INTO purchase_orders (po_number, supplier_id, status, currency_code, exchange_rate,
       total_amount_orig, total_amount_twd, warehouse_id, created_by)
     VALUES ($1, $2, 'confirmed', 'TWD', 1, 79000, 79000, $3, NULL) RETURNING id`,
    [boPoNum, supplierId, warehouseId]
  );
  const testPoId = poRes.rows[0].id;

  const poItemRes = await query(
    `INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price_orig, unit_price_twd, subtotal_orig, subtotal_twd)
     VALUES ($1, $2, 50, 1580, 1580, 79000, 79000) RETURNING id`,
    [testPoId, productId]
  );
  const testPoItemId = poItemRes.rows[0].id;

  const grRes = await query(
    `INSERT INTO goods_receipts (gr_number, po_id, supplier_id, warehouse_id, status, received_date, currency_code, exchange_rate, total_amount_orig, total_amount_twd, created_by)
     VALUES ($4, $1, $2, $3, 'draft', CURRENT_DATE, 'TWD', 1, 79000, 79000, NULL) RETURNING id`,
    [testPoId, supplierId, warehouseId, `GR-TEST-BO-${Date.now()}`]
  );
  const testGrId = grRes.rows[0].id;

  await query(
    `INSERT INTO goods_receipt_items (gr_id, po_item_id, product_id, quantity, unit_price_orig, unit_price_twd, subtotal_orig, subtotal_twd)
     VALUES ($1, $2, $3, 50, 1580, 1580, 79000, 79000)`,
    [testGrId, testPoItemId, productId]
  );

  // Complete GR → triggers batch creation + backorder settlement
  await query(
    `UPDATE goods_receipts SET status='completed', completed_at=NOW() WHERE id=$1`, [testGrId]
  );

  // Verify new batch C created with 50 units
  const newBatch = await query(
    `SELECT * FROM stock_batches WHERE source_type='gr' AND source_id=$1`, [testGrId]
  );
  assert.ok(newBatch.rows.length > 0, '應建立新批次');
  const actualCost = 1580;

  // Verify backorder settled
  const boAfter = await query(
    'SELECT * FROM backorders WHERE id = $1', [bo.id]
  );
  assert.equal(boAfter.rows[0].status, 'settled', 'backorder 應已結算');

  // Verify COGS adjustment: variance = qty × (actual - estimated) = 20 × (1580 - 1529) = 1020
  const adj = await query(
    'SELECT * FROM sales_cogs_adjustments WHERE backorder_id = $1', [bo.id]
  );
  assert.ok(adj.rows.length > 0, '應有 COGS 調整記錄');
  const expectedVariance = boQty * (actualCost - boEstCost);
  assert.equal(Number(adj.rows[0].variance), expectedVariance,
    `Variance 應為 ${expectedVariance}，實際 ${adj.rows[0].variance}`);

  // Verify new batch has correct remaining (50 - 20 backorder settled = 30)
  const batchAfter = await query(
    'SELECT remaining_qty FROM stock_batches WHERE source_type=$1 AND source_id=$2',
    ['gr', testGrId]
  );
  assert.equal(Number(batchAfter.rows[0].remaining_qty), 50 - boQty,
    `新批次剩餘應為 ${50 - boQty}`);

  // Verify 2 transactions: gr_in + backorder_settle
  const txns = await query(
    `SELECT txn_type FROM inventory_transactions WHERE reference_doc_id=$1 AND reference_doc_type='gr'
     UNION ALL
     SELECT txn_type FROM inventory_transactions WHERE txn_type='backorder_settle' AND reference_doc_id=$2`,
    [testGrId, bo.id]
  );
  const txnTypes = txns.rows.map(r => r.txn_type);
  assert.ok(txnTypes.includes('gr_in'), '應有 gr_in 異動');
  assert.ok(txnTypes.includes('backorder_settle'), '應有 backorder_settle 異動');
});

test('4. 跨倉調撥 (BOND → MAIN)', async () => {
  // Create batch in BOND warehouse
  const bondBatch = await query(
    `INSERT INTO stock_batches (product_id, warehouse_id, received_date, quantity, remaining_qty, unit_cost_twd, status)
     VALUES ($1, $2, CURRENT_DATE, 30, 30, 1600, 'active') RETURNING id`,
    [productId, warehouse2Id]
  );
  const bondBatchId = bondBatch.rows[0].id;

  // Create transfer BOND → MAIN
  const trRes = await req('POST', '/api/inventory-transfers', {
    from_warehouse: warehouse2Id,
    to_warehouse:   warehouseId,
    items: [{ from_batch_id: bondBatchId, product_id: productId, quantity: 30 }],
  }, token);
  assert.equal(trRes.status, 201, JSON.stringify(trRes.body));
  const trId = trRes.body.id;

  // Complete transfer
  const completeRes = await req('POST', `/api/inventory-transfers/${trId}/complete`, {}, token);
  assert.equal(completeRes.status, 200, JSON.stringify(completeRes.body));

  // Verify source batch depleted
  const srcBatch = await query('SELECT remaining_qty, status FROM stock_batches WHERE id = $1', [bondBatchId]);
  assert.equal(Number(srcBatch.rows[0].remaining_qty), 0, '來源批次剩餘應為 0');

  // Verify destination batch created in MAIN warehouse
  const destBatch = await query(
    `SELECT sb.* FROM stock_batches sb
     JOIN inventory_transfer_items iti ON iti.to_batch_id = sb.id
     WHERE iti.transfer_id = $1`,
    [trId]
  );
  assert.ok(destBatch.rows.length > 0, '目的倉應有新批次');
  assert.equal(Number(destBatch.rows[0].remaining_qty), 30, '目的批次應有 30 條');
  assert.equal(destBatch.rows[0].warehouse_id, warehouseId, '應在 MAIN 倉');

  // Verify transaction log
  const txns = await query(
    `SELECT txn_type FROM inventory_transactions WHERE reference_doc_type='transfer' AND reference_doc_id=$1`,
    [trId]
  );
  const types = txns.rows.map(r => r.txn_type);
  assert.ok(types.includes('transfer_out'), '應有 transfer_out 異動');
  assert.ok(types.includes('transfer_in'), '應有 transfer_in 異動');
});

test('5. append-only 違規攔截 (不允許 UPDATE/DELETE inventory_transactions)', async () => {
  // Try UPDATE
  try {
    await query(`UPDATE inventory_transactions SET notes='test' WHERE id IN (SELECT id FROM inventory_transactions LIMIT 1)`);
    assert.fail('應該被 trigger 攔截，不允許 UPDATE');
  } catch (err) {
    assert.ok(err.message.includes('append-only') || err.message.includes('禁止修改'), `UPDATE 應被阻擋: ${err.message}`);
  }

  // Try DELETE
  try {
    await query(`DELETE FROM inventory_transactions WHERE id IN (SELECT id FROM inventory_transactions LIMIT 1)`);
    assert.fail('應該被 trigger 攔截，不允許 DELETE');
  } catch (err) {
    assert.ok(err.message.includes('append-only') || err.message.includes('禁止修改'), `DELETE 應被阻擋: ${err.message}`);
  }
});
