const cron = require('node-cron');
const { query } = require('../db/index');
const { notify, notifyInApp } = require('../services/line-bot');

// Check low stock daily at 08:00 and notify relevant users
cron.schedule('0 8 * * *', async () => {
  console.log('[notification-worker] 執行每日低庫存檢查...');
  try {
    const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '10');
    const lowStock = await query(
      `SELECT p.id, p.sku, p.name, COALESCE(SUM(sb.remaining_qty), 0) AS qty
       FROM products p
       LEFT JOIN stock_batches sb ON sb.product_id = p.id AND sb.status = 'active'
       WHERE p.deleted_at IS NULL
       GROUP BY p.id, p.sku, p.name
       HAVING COALESCE(SUM(sb.remaining_qty), 0) < $1
       ORDER BY qty ASC`,
      [threshold]
    );

    if (lowStock.rows.length === 0) return;

    const body = lowStock.rows
      .map(r => `• ${r.name} (${r.sku}): ${r.qty} 件`)
      .join('\n');

    // Send LINE notification to all subscribed managers/owners
    await notify('low_stock', '庫存預警', `以下品項庫存不足 ${threshold} 件:\n${body}`,
      { items: lowStock.rows });

    // Also create in-app notifications for all active owners/managers
    const managers = await query(
      `SELECT u.id FROM users u
       JOIN user_notification_prefs unp ON unp.user_id = u.id
         AND unp.channel = 'in_app' AND unp.event_type = 'low_stock' AND unp.is_enabled = TRUE
       WHERE u.is_active = TRUE AND u.role IN ('owner', 'manager')`
    );
    for (const mgr of managers.rows) {
      await notifyInApp(mgr.id, 'low_stock', '庫存預警',
        `${lowStock.rows.length} 項商品庫存低於 ${threshold} 件`, { count: lowStock.rows.length });
    }

    console.log(`[notification-worker] 低庫存通知: ${lowStock.rows.length} 筆`);
  } catch (err) {
    console.error('[notification-worker] 低庫存檢查失敗:', err.message);
  }
});

// Check AR overdue daily at 09:00
cron.schedule('0 9 * * *', async () => {
  console.log('[notification-worker] 執行應收帳款逾期檢查...');
  try {
    const overdue = await query(
      `SELECT ar.id, c.name AS customer_name, ar.invoice_number,
              ar.due_date, ar.amount_remaining
       FROM ar_invoices ar
       JOIN customers c ON c.id = ar.customer_id
       WHERE ar.status IN ('unpaid', 'partial')
         AND ar.due_date < CURRENT_DATE
       ORDER BY ar.due_date ASC
       LIMIT 50`
    );

    if (overdue.rows.length === 0) return;

    const body = overdue.rows
      .map(r => `• ${r.customer_name} ${r.invoice_number}: TWD ${Number(r.amount_remaining).toLocaleString()}`)
      .join('\n');

    await notify('ar_overdue', 'AR 逾期提醒',
      `以下應收帳款已逾期 (${overdue.rows.length} 筆):\n${body}`,
      { count: overdue.rows.length });

    console.log(`[notification-worker] AR 逾期通知: ${overdue.rows.length} 筆`);
  } catch (err) {
    console.error('[notification-worker] AR 逾期檢查失敗:', err.message);
  }
});

// Check AP due within 7 days at 09:30
cron.schedule('30 9 * * *', async () => {
  console.log('[notification-worker] 執行應付帳款到期預警...');
  try {
    const dueSoon = await query(
      `SELECT ab.id, s.name AS supplier_name, ab.bill_number,
              ab.due_date, ab.amount_remaining
       FROM ap_bills ab
       JOIN suppliers s ON s.id = ab.supplier_id
       WHERE ab.status IN ('unpaid', 'partial')
         AND ab.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
       ORDER BY ab.due_date ASC
       LIMIT 50`
    );

    if (dueSoon.rows.length === 0) return;

    const body = dueSoon.rows
      .map(r => `• ${r.supplier_name} ${r.bill_number}: TWD ${Number(r.amount_remaining).toLocaleString()} (到期: ${r.due_date})`)
      .join('\n');

    await notify('ap_due_soon', 'AP 即將到期',
      `以下應付帳款 7 天內到期 (${dueSoon.rows.length} 筆):\n${body}`,
      { count: dueSoon.rows.length });

    console.log(`[notification-worker] AP 到期預警: ${dueSoon.rows.length} 筆`);
  } catch (err) {
    console.error('[notification-worker] AP 到期檢查失敗:', err.message);
  }
});

console.log('[notification-worker] 通知排程已啟動 (每日庫存/AR/AP 檢查)');
