const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const http   = require('http');
const { query } = require('../src/db/index');
const app  = require('../src/index');

let server, token, mgrToken;
let supplierId, customerId, productId, warehouseId;
let apBillId, arInvoiceId;

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
               VALUES ($1,$2,'財務測試', 'accounting', TRUE)`, [`acc2d_${suffix}`, hash]);
  await query(`INSERT INTO users (username, password_hash, full_name, role, is_active)
               VALUES ($1,$2,'主管', 'manager', TRUE)`, [`mgr2d_${suffix}`, hash]);
  const loginRes = await req('POST', '/api/auth/login', { username: `acc2d_${suffix}`, password: 'pass1234' });
  token = loginRes.body.token;
  const mgrLogin = await req('POST', '/api/auth/login', { username: `mgr2d_${suffix}`, password: 'pass1234' });
  mgrToken = mgrLogin.body.token;

  const wRes = await query(`INSERT INTO warehouses (code,name,type) VALUES ($1,'2D倉','main') RETURNING id`, [`W2D-${suffix}`]);
  warehouseId = wRes.rows[0].id;

  const pRes = await query(`INSERT INTO products (sku,name,unit,list_price) VALUES ($1,'2D輪胎','條',2000) RETURNING id`, [`2D-${suffix}`]);
  productId = pRes.rows[0].id;

  // Supplier with THB
  const sRes = await query(`INSERT INTO suppliers (code,name,currency_code,payment_terms) VALUES ($1,'泰國2D廠','THB',30) RETURNING id`, [`S2D-${suffix}`]);
  supplierId = sRes.rows[0].id;

  // Customer
  const cRes = await query(`INSERT INTO customers (code,name,tier,payment_terms,credit_limit) VALUES ($1,'2D車行','dealer',30,500000) RETURNING id`, [`C2D-${suffix}`]);
  customerId = cRes.rows[0].id;
});

after(async () => {
  for (const t of ['ap_payment_allocations','ap_payments','ar_receipt_allocations','ar_receipts',
    'ar_invoices','ap_bills']) {
    await query(`DELETE FROM ${t} WHERE supplier_id=$1 OR customer_id=$2`,
      [supplierId, customerId]).catch(() => {});
  }
  await query('DELETE FROM inventory_transactions WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM backorders WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM sales_cogs_adjustments WHERE sd_item_id IN (SELECT id FROM sales_delivery_items WHERE product_id=$1)', [productId]).catch(() => {});
  await query('DELETE FROM sales_delivery_items WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM sales_deliveries WHERE so_id IN (SELECT id FROM sales_orders WHERE customer_id=$1)', [customerId]).catch(() => {});
  await query('DELETE FROM sales_order_items WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM sales_orders WHERE customer_id=$1', [customerId]).catch(() => {});
  await query('DELETE FROM stock_batches WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM goods_receipt_items WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM goods_receipts WHERE warehouse_id=$1', [warehouseId]).catch(() => {});
  await query('DELETE FROM purchase_order_items WHERE product_id=$1', [productId]).catch(() => {});
  await query('DELETE FROM purchase_orders WHERE supplier_id=$1', [supplierId]).catch(() => {});
  await query('DELETE FROM warehouses WHERE id=$1', [warehouseId]).catch(() => {});
  await query('DELETE FROM products WHERE id=$1', [productId]).catch(() => {});
  await query('DELETE FROM customers WHERE id=$1', [customerId]).catch(() => {});
  await query('DELETE FROM suppliers WHERE id=$1', [supplierId]).catch(() => {});
  await query(`DELETE FROM users WHERE username LIKE 'acc2d_%' OR username LIKE 'mgr2d_%'`).catch(() => {});
  await new Promise(r => server.close(r));
});

test('1. AR 自動產生 — SD 完成後自動建立 AR', async () => {
  // Setup: create batch for FIFO, SO, SD, complete
  await query(`INSERT INTO stock_batches (product_id,warehouse_id,received_date,quantity,remaining_qty,unit_cost_twd,status)
               VALUES ($1,$2,CURRENT_DATE,100,100,1000,'active'::batch_status)`, [productId, warehouseId]);

  // Use mgrToken to create + confirm SO (accounting role can't create SO)
  const soRes = await req('POST', '/api/sales-orders', {
    customer_id: customerId,
    items: [{ product_id: productId, quantity: 10, unit_price_orig: 2000 }],
  }, mgrToken);
  assert.equal(soRes.status, 201, JSON.stringify(soRes.body));

  const soId = soRes.body.id;
  await req('POST', `/api/sales-orders/${soId}/confirm`, {}, mgrToken);

  const soDetail = await req('GET', `/api/sales-orders/${soId}`, null, token);
  const soItemId = soDetail.body.items[0].id;

  const sdRes = await req('POST', '/api/sales-deliveries', {
    so_id: soId,
    items: [{ product_id: productId, so_item_id: soItemId, warehouse_id: warehouseId, quantity: 10, unit_price_twd: 2000 }],
  }, mgrToken);
  assert.equal(sdRes.status, 201, JSON.stringify(sdRes.body));

  // Complete SD → triggers AR creation
  const completeRes = await req('POST', `/api/sales-deliveries/${sdRes.body.id}/complete`, {}, mgrToken);
  assert.equal(completeRes.status, 200, JSON.stringify(completeRes.body));

  // Check AR was auto-created
  const arRes = await query('SELECT * FROM ar_invoices WHERE customer_id=$1 AND so_id=$2', [customerId, soId]);
  assert.ok(arRes.rows.length > 0, 'AR 應自動建立');
  arInvoiceId = arRes.rows[0].id;

  // due_date should be invoice_date + payment_terms (30 days)
  const inv = arRes.rows[0];
  assert.ok(inv.amount_twd > 0, 'AR 金額應 > 0');
  assert.equal(inv.status, 'pending', 'AR 初始狀態應為 pending');
});

test('2. AP 多幣別自動產生 — GR (THB 200000 @ 0.95) 完成後建 AP', async () => {
  const suffix = String(Date.now()).slice(-7);
  // Create PO in THB
  const poNum = `PO-2D-${suffix}`;
  const poRes = await query(
    `INSERT INTO purchase_orders (po_number,supplier_id,status,currency_code,exchange_rate,total_amount_orig,total_amount_twd,warehouse_id)
     VALUES ($1,$2,'confirmed','THB',0.95,200000,190000,$3) RETURNING id`,
    [poNum, supplierId, warehouseId]
  );
  const poId = poRes.rows[0].id;
  const poItemRes = await query(
    `INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,100,2000,1900,200000,190000) RETURNING id`,
    [poId, productId]
  );

  // Create GR and complete it
  const grNum = `GR-2D-${suffix}`;
  const grRes = await query(
    `INSERT INTO goods_receipts (gr_number,po_id,supplier_id,warehouse_id,status,received_date,currency_code,exchange_rate,total_amount_orig,total_amount_twd)
     VALUES ($1,$2,$3,$4,'draft',CURRENT_DATE,'THB',0.95,200000,190000) RETURNING id`,
    [grNum, poId, supplierId, warehouseId]
  );
  const grId = grRes.rows[0].id;
  await query(
    `INSERT INTO goods_receipt_items (gr_id,po_item_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,$3,100,2000,1900,200000,190000)`,
    [grId, poItemRes.rows[0].id, productId]
  );

  // Complete GR → triggers AP creation + stock batch
  await query(`UPDATE goods_receipts SET status='completed',completed_at=NOW() WHERE id=$1`, [grId]);

  // Check AP was auto-created
  const apRes = await query('SELECT * FROM ap_bills WHERE gr_id=$1', [grId]);
  assert.ok(apRes.rows.length > 0, 'AP 應自動建立');
  apBillId = apRes.rows[0].id;

  const bill = apRes.rows[0];
  assert.equal(Number(bill.amount_orig), 200000, 'amount_orig 應為 200000 THB');
  assert.equal(Number(bill.amount_twd),  190000, 'amount_twd 應為 190000 TWD (200000 × 0.95)');
  assert.equal(bill.currency_code, 'THB', '幣別應為 THB');
  assert.equal(Number(bill.exchange_rate), 0.95, '匯率應為 0.95');
});

test('3. 外匯損益計算 — 30天後以 0.93 付款，應產生 +4000 匯差收益', async () => {
  assert.ok(apBillId, '需要先有 AP bill');

  // Create payment at rate 0.93
  // Actual payment: 200000 × 0.93 = 186000 TWD
  // Booked at:      200000 × 0.95 = 190000 TWD
  // Forex gain:     190000 - 186000 = +4000
  const payRes = await req('POST', '/api/ap-payments', {
    supplier_id:       supplierId,
    currency_code:     'THB',
    exchange_rate:     0.93,
    amount_orig:       200000,
    payment_method_id: 1,
    notes:             '30天後付款 @ 0.93',
  }, token);
  assert.equal(payRes.status, 201, JSON.stringify(payRes.body));
  const payId = payRes.body.id;

  // Complete payment → triggers allocation + forex calc
  const completeRes = await req('POST', `/api/ap-payments/${payId}/complete`, {}, token);
  assert.equal(completeRes.status, 200, JSON.stringify(completeRes.body));

  // Verify ap_payment_allocations
  const allocRes = await query(
    'SELECT * FROM ap_payment_allocations WHERE payment_id=$1', [payId]
  );
  assert.ok(allocRes.rows.length > 0, '應有 allocation 記錄');
  const alloc = allocRes.rows[0];
  assert.equal(Number(alloc.bill_exchange_rate),    0.95, 'bill 匯率應為 0.95');
  assert.equal(Number(alloc.payment_exchange_rate), 0.93, 'payment 匯率應為 0.93');
  assert.equal(Number(alloc.forex_gain_loss), 4000,
    `外匯損益應為 +4000，實際 ${alloc.forex_gain_loss}`);

  // Verify AP bill status
  const billRes = await query('SELECT * FROM ap_bills WHERE id=$1', [apBillId]);
  const bill = billRes.rows[0];
  assert.equal(bill.status, 'paid', 'AP 狀態應為 paid');
  assert.equal(Number(bill.amount_paid_twd), 186000,
    `實付 TWD 應為 186000，實際 ${bill.amount_paid_twd}`);
  assert.equal(Number(bill.forex_gain_loss_twd), 4000,
    `AP 外匯損益累計應為 +4000，實際 ${bill.forex_gain_loss_twd}`);
});

test('4. 票據跳票還原 — 支票收款 → 跳票 → AR 回到 pending', async () => {
  assert.ok(arInvoiceId, '需要先有 AR invoice');

  // Check invoice's current status and remaining
  const invBefore = await query('SELECT * FROM ar_invoices WHERE id=$1', [arInvoiceId]);
  const inv = invBefore.rows[0];

  // Create check receipt
  const recRes = await req('POST', '/api/ar-receipts', {
    customer_id:       customerId,
    currency_code:     'TWD',
    exchange_rate:     1,
    amount_orig:       Number(inv.amount_remaining),
    payment_method_id: 3,  // CHECK
    check_number:      'CHK-001',
    check_due_date:    new Date(Date.now() + 14*86400000).toISOString().slice(0,10),
  }, token);
  assert.equal(recRes.status, 201, JSON.stringify(recRes.body));
  const recId = recRes.body.id;

  // Complete receipt → AR should be paid
  await req('POST', `/api/ar-receipts/${recId}/complete`, {}, token);
  const arAfterComplete = await query('SELECT status FROM ar_invoices WHERE id=$1', [arInvoiceId]);
  assert.equal(arAfterComplete.rows[0].status, 'paid', 'AR 應在收款後變為 paid');

  // Bounce the check → AR should revert to pending
  const bounceRes = await req('POST', `/api/ar-receipts/${recId}/bounce`, {}, token);
  assert.equal(bounceRes.status, 200, JSON.stringify(bounceRes.body));

  const arAfterBounce = await query('SELECT status, amount_remaining FROM ar_invoices WHERE id=$1', [arInvoiceId]);
  assert.equal(arAfterBounce.rows[0].status, 'pending', 'AR 跳票後應回到 pending');
  assert.ok(Number(arAfterBounce.rows[0].amount_remaining) > 0, 'AR 剩餘金額應恢復');
});
