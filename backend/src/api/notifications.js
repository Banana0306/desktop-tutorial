const express = require('express');
const { query } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');
const { parseWebhookSignature, notifyInApp } = require('../services/line-bot');

const router = express.Router();
const auth = [authenticate];
const authManager = [authenticate, requireRole('owner', 'manager')];

// ============================================================
// LINE webhook (no auth — verified by signature)
// ============================================================
router.post('/line/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['x-line-signature'];
  if (!parseWebhookSignature(req.body, sig)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let events;
  try { events = JSON.parse(req.body).events; } catch { return res.status(400).end(); }

  for (const evt of events) {
    if (evt.type === 'follow') {
      // User added bot — store subscription pending link
      console.log('[line-webhook] follow event, lineUserId:', evt.source.userId);
    } else if (evt.type === 'message' && evt.message.type === 'text') {
      const text = evt.message.text.trim();
      // Link command: "link:<userId>"
      if (text.startsWith('link:')) {
        const erpUserId = text.slice(5).trim();
        await query(
          `INSERT INTO line_subscriptions (user_id, line_user_id)
           VALUES ($1, $2)
           ON CONFLICT (line_user_id) DO UPDATE SET user_id = $1, is_active = TRUE, updated_at = NOW()`,
          [erpUserId, evt.source.userId]
        ).catch(err => console.error('[line-webhook] link error:', err.message));
      }
    } else if (evt.type === 'unfollow') {
      await query(
        `UPDATE line_subscriptions SET is_active = FALSE, updated_at = NOW()
         WHERE line_user_id = $1`,
        [evt.source.userId]
      ).catch(() => {});
    }
  }

  res.status(200).json({ ok: true });
});

// GET /api/notifications/my-prefs
router.get('/my-prefs', auth, async (req, res) => {
  try {
    const r = await query(
      `SELECT channel, event_type, is_enabled
       FROM user_notification_prefs WHERE user_id = $1 ORDER BY channel, event_type`,
      [req.user.id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/notifications/my-prefs  body: [{channel, event_type, is_enabled}]
router.put('/my-prefs', auth, async (req, res) => {
  try {
    const prefs = req.body;
    if (!Array.isArray(prefs)) return res.status(400).json({ error: '請提供偏好設定陣列' });

    for (const p of prefs) {
      await query(
        `INSERT INTO user_notification_prefs (user_id, channel, event_type, is_enabled)
         VALUES ($1, $2::notification_channel, $3::notification_event, $4)
         ON CONFLICT (user_id, channel, event_type) DO UPDATE SET is_enabled = $4, updated_at = NOW()`,
        [req.user.id, p.channel, p.event_type, Boolean(p.is_enabled)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('通知偏好更新錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/notifications/inbox?limit=50&offset=0
router.get('/inbox', auth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const r = await query(
      `SELECT id, event_type, title, body, payload, sent_at, created_at
       FROM notification_logs
       WHERE user_id = $1 AND channel = 'in_app'
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/notifications/line-status
router.get('/line-status', auth, async (req, res) => {
  try {
    const r = await query(
      'SELECT line_user_id, display_name, is_active, linked_at FROM line_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ data: r.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// DELETE /api/notifications/line-unlink
router.delete('/line-unlink', auth, async (req, res) => {
  try {
    await query(
      'UPDATE line_subscriptions SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/notifications/web-push/subscribe
router.post('/web-push/subscribe', auth, async (req, res) => {
  try {
    const { endpoint, p256dh_key, auth_key, user_agent } = req.body;
    if (!endpoint || !p256dh_key || !auth_key) {
      return res.status(400).json({ error: '請提供推播訂閱資料' });
    }
    await query(
      `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, is_active = TRUE, last_used_at = NOW()`,
      [req.user.id, endpoint, p256dh_key, auth_key, user_agent || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Web push subscribe error:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/notifications/web-push/unsubscribe
router.post('/web-push/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await query(
      'UPDATE web_push_subscriptions SET is_active = FALSE WHERE user_id = $1 AND endpoint = $2',
      [req.user.id, endpoint]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/notifications/low-stock-check  (manual trigger for testing)
router.get('/low-stock-check', authManager, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold || '10');
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

    for (const item of lowStock.rows) {
      await notifyInApp(
        req.user.id, 'low_stock',
        '庫存預警',
        `${item.name} (${item.sku}) 庫存僅剩 ${item.qty} 件`,
        { product_id: item.id, qty: item.qty }
      );
    }

    res.json({ checked: lowStock.rows.length, items: lowStock.rows });
  } catch (err) {
    console.error('低庫存檢查錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
