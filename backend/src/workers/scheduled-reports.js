const cron = require('node-cron');
const { query } = require('../db/index');

// Runs on the 1st of every month at 01:00 to snapshot the previous month
cron.schedule('0 1 1 * *', async () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodCode = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  console.log(`[scheduled-reports] 產生 ${periodCode} 月度庫存快照...`);
  try {
    const r = await query('SELECT COUNT(*) FROM generate_monthly_inventory_snapshot($1)', [periodCode]);
    console.log(`[scheduled-reports] ${periodCode} 快照完成`);
  } catch (err) {
    console.error(`[scheduled-reports] 快照失敗:`, err.message);
  }
});

console.log('[scheduled-reports] 月度快照排程已啟動 (每月 1 日 01:00)');
