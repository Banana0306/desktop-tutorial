const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const http   = require('http');
const { query } = require('../src/db/index');
const app  = require('../src/index');

let server, token;
let supplierId, warehouseId;
let product1Id, product2Id;
let grId, grItem1Id, grItem2Id;

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
               VALUES ($1,$2,'主管', 'manager', TRUE)`, [`mgr3_${suffix}`, hash]);
  const loginRes = await req('POST', '/api/auth/login', { username: `mgr3_${suffix}`, password: 'pass1234' });
  token = loginRes.body.token;

  const wRes = await query(`INSERT INTO warehouses (code,name,type) VALUES ($1,'主倉3','main') RETURNING id`, [`W3-${suffix}`]);
  warehouseId = wRes.rows[0].id;

  const sRes = await query(`INSERT INTO suppliers (code,name,currency_code,payment_terms) VALUES ($1,'Michelin泰','THB',30) RETURNING id`, [`SM-${suffix}`]);
  supplierId = sRes.rows[0].id;

  // Michelin 100/90-12 (requires BSMI)
  const p1 = await query(
    `INSERT INTO products (sku,name,unit,list_price,weight_kg,default_customs_duty_rate,default_commodity_tax_rate,requires_bsmi)
     VALUES ($1,'Michelin 100/90-12','條',2000, 3.5, 0.20, 0.15, TRUE) RETURNING id`,
    [`MIC-100-${suffix}`]
  );
  product1Id = p1.rows[0].id;

  // Michelin 120/80-17 (no BSMI)
  const p2 = await query(
    `INSERT INTO products (sku,name,unit,list_price,weight_kg,default_customs_duty_rate,default_commodity_tax_rate,requires_bsmi)
     VALUES ($1,'Michelin 120/80-17','條',2500, 4.2, 0.20, 0.15, FALSE) RETURNING id`,
    [`MIC-120-${suffix}`]
  );
  product2Id = p2.rows[0].id;

  // Create completed GR with 2 products
  const poSuffix = String(Date.now()).slice(-8);
  const poRes = await query(
    `INSERT INTO purchase_orders (po_number,supplier_id,status,currency_code,exchange_rate,total_amount_orig,total_amount_twd,warehouse_id)
     VALUES ($1,$2,'confirmed','THB',0.95,700000,665000,$3) RETURNING id`,
    [`PO-3-${poSuffix}`, supplierId, warehouseId]
  );
  const poId = poRes.rows[0].id;

  const poi1 = await query(
    `INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,200,2000,1900,400000,380000) RETURNING id`, [poId, product1Id]
  );
  const poi2 = await query(
    `INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,120,2500,2375,300000,285000) RETURNING id`, [poId, product2Id]
  );

  const grRes = await query(
    `INSERT INTO goods_receipts (gr_number,po_id,supplier_id,warehouse_id,status,received_date,currency_code,exchange_rate,total_amount_orig,total_amount_twd,customs_exchange_rate)
     VALUES ($1,$2,$3,$4,'draft',CURRENT_DATE,'THB',0.95,700000,665000,0.95) RETURNING id`,
    [`GR-3-${poSuffix}`, poId, supplierId, warehouseId]
  );
  grId = grRes.rows[0].id;

  const gri1 = await query(
    `INSERT INTO goods_receipt_items (gr_id,po_item_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,$3,200,2000,1900,400000,380000) RETURNING id`, [grId, poi1.rows[0].id, product1Id]
  );
  grItem1Id = gri1.rows[0].id;

  const gri2 = await query(
    `INSERT INTO goods_receipt_items (gr_id,po_item_id,product_id,quantity,unit_price_orig,unit_price_twd,subtotal_orig,subtotal_twd)
     VALUES ($1,$2,$3,120,2500,2375,300000,285000) RETURNING id`, [grId, poi2.rows[0].id, product2Id]
  );
  grItem2Id = gri2.rows[0].id;

  // Complete GR (creates batches)
  await query(`UPDATE goods_receipts SET status='completed',completed_at=NOW() WHERE id=$1`, [grId]);
});

after(async () => {
  await query('SELECT test_cleanup_by_products($1)', [[product1Id, product2Id]]).catch(() => {});
  await query('DELETE FROM landed_cost_components WHERE gr_id=$1', [grId]).catch(() => {});
  await query('DELETE FROM goods_receipt_items WHERE gr_id=$1', [grId]).catch(() => {});
  await query('DELETE FROM goods_receipts WHERE id=$1', [grId]).catch(() => {});
  await query(`DELETE FROM purchase_order_items WHERE product_id IN ($1,$2)`, [product1Id, product2Id]).catch(() => {});
  await query('DELETE FROM purchase_orders WHERE supplier_id=$1', [supplierId]).catch(() => {});
  await query('DELETE FROM warehouses WHERE id=$1', [warehouseId]).catch(() => {});
  await query('DELETE FROM products WHERE id IN ($1,$2)', [product1Id, product2Id]).catch(() => {});
  await query('DELETE FROM suppliers WHERE id=$1', [supplierId]).catch(() => {});
  await query(`DELETE FROM users WHERE username LIKE 'mgr3_%'`).catch(() => {});
  await new Promise(r => server.close(r));
});

test('1. 錄入共同成本 + 重算落地成本 (Michelin 範例)', async () => {
  // Add cost components
  // Inland freight: 12,000 TWD (all items)
  const fc1 = await req('POST', `/api/goods-receipts/${grId}/landed-cost-components`, {
    component_type: 'inland_freight', amount_twd: 12000, apply_to_all: true,
    description: '內陸運費',
  }, token);
  assert.equal(fc1.status, 201, JSON.stringify(fc1.body));

  // BSMI fee: 5,000 TWD (only product 1)
  const fc2 = await req('POST', `/api/goods-receipts/${grId}/landed-cost-components`, {
    component_type: 'bsmi_fee', amount_twd: 5000, apply_to_all: false,
    apply_product_ids: [product1Id],
    description: 'BSMI 商檢費 (100/90-12)',
  }, token);
  assert.equal(fc2.status, 201, JSON.stringify(fc2.body));

  // Customs duty: auto-calculated from rates
  // Product 1: 200 * 1900 * 0.20 = 76,000 TWD
  // Product 2: 120 * 2375 * 0.20 = 57,000 TWD
  const fc3 = await req('POST', `/api/goods-receipts/${grId}/landed-cost-components`, {
    component_type: 'customs_duty',
    amount_twd: 76000 + 57000,  // 133,000
    apply_to_all: true,
    description: '進口關稅 20%',
  }, token);
  assert.equal(fc3.status, 201);

  // Commodity tax: (CIF + duty) * 15%
  // Product 1: (380000 + 76000) * 0.15 = 68,400
  // Product 2: (285000 + 57000) * 0.15 = 51,300
  const fc4 = await req('POST', `/api/goods-receipts/${grId}/landed-cost-components`, {
    component_type: 'commodity_tax',
    amount_twd: 68400 + 51300, // 119,700
    apply_to_all: true,
    description: '貨物稅 15%',
  }, token);
  assert.equal(fc4.status, 201);

  // Recalculate using value allocation
  const calcRes = await req('POST', `/api/goods-receipts/${grId}/recalculate-landed-cost`,
    { allocation_method: 'value' }, token);
  assert.equal(calcRes.status, 200, JSON.stringify(calcRes.body));

  const breakdown = calcRes.body.data;
  assert.ok(breakdown.length === 2, '應有 2 個品項');

  // Verify item 1 (Michelin 100/90-12, 200條)
  const item1 = breakdown.find(b => b.product_id === product1Id);
  assert.ok(item1, '應有 item1 計算結果');

  // Verify item 2 (Michelin 120/80-17, 120條)
  const item2 = breakdown.find(b => b.product_id === product2Id);
  assert.ok(item2, '應有 item2 計算結果');

  // Both should have landed unit cost > original cost
  assert.ok(Number(item1.landed_unit_cost) > 1900, `Item1 落地成本應 > 1900, 實際: ${item1.landed_unit_cost}`);
  assert.ok(Number(item2.landed_unit_cost) > 2375, `Item2 落地成本應 > 2375, 實際: ${item2.landed_unit_cost}`);

  console.log(`  Item1 (100/90-12) 落地單價: TWD ${item1.landed_unit_cost}`);
  console.log(`  Item2 (120/80-17) 落地單價: TWD ${item2.landed_unit_cost}`);
});

test('2. BSMI 費用只攤到 Product 1 (不攤到 Product 2)', async () => {
  const item1 = await query(
    'SELECT allocated_bsmi_fee FROM goods_receipt_items WHERE id=$1', [grItem1Id]
  );
  const item2 = await query(
    'SELECT allocated_bsmi_fee FROM goods_receipt_items WHERE id=$1', [grItem2Id]
  );

  assert.ok(Number(item1.rows[0].allocated_bsmi_fee) > 0,
    'Product 1 應有 BSMI 費用');
  assert.equal(Number(item2.rows[0].allocated_bsmi_fee), 0,
    'Product 2 不應有 BSMI 費用');
});

test('3. 批次單位成本已更新為落地成本', async () => {
  const batches = await query(
    `SELECT sb.unit_cost_twd, gri.landed_unit_cost_twd
     FROM stock_batches sb
     JOIN goods_receipt_items gri ON gri.id = sb.gr_item_id
     WHERE gri.gr_id = $1`,
    [grId]
  );
  for (const row of batches.rows) {
    assert.ok(
      Math.abs(Number(row.unit_cost_twd) - Number(row.landed_unit_cost_twd)) < 0.01,
      `批次成本 ${row.unit_cost_twd} 應等於落地成本 ${row.landed_unit_cost_twd}`
    );
  }
});
