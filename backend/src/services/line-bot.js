const line = require('@line/bot-sdk');
const { query } = require('../db/index');

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const channelSecret      = process.env.LINE_CHANNEL_SECRET;

const isConfigured = Boolean(channelAccessToken && channelSecret);

let client;
if (isConfigured) {
  client = new line.messagingApi.MessagingApiClient({ channelAccessToken });
}

async function sendToUser(userId, message) {
  if (!isConfigured) {
    console.warn('[line-bot] LINE not configured, skipping send');
    return false;
  }
  try {
    await client.pushMessage({ to: userId, messages: [{ type: 'text', text: message }] });
    return true;
  } catch (err) {
    console.error('[line-bot] pushMessage error:', err.message);
    return false;
  }
}

async function notify(eventType, titleText, bodyText, payload = {}) {
  // Find users with LINE enabled for this event type
  const subs = await query(
    `SELECT ls.line_user_id, u.id AS user_id
     FROM line_subscriptions ls
     JOIN users u ON u.id = ls.user_id
     JOIN user_notification_prefs unp ON unp.user_id = u.id
       AND unp.channel = 'line' AND unp.event_type = $1 AND unp.is_enabled = TRUE
     WHERE ls.is_active = TRUE AND u.is_active = TRUE`,
    [eventType]
  );

  for (const sub of subs.rows) {
    const ok = await sendToUser(sub.line_user_id, `【${titleText}】\n${bodyText}`);
    await query(
      `INSERT INTO notification_logs (user_id, channel, event_type, status, title, body, payload, sent_at)
       VALUES ($1, 'line', $2, $3, $4, $5, $6, $7)`,
      [sub.user_id, eventType, ok ? 'sent' : 'failed',
       titleText, bodyText, JSON.stringify(payload), ok ? new Date() : null]
    );
  }
}

async function notifyInApp(userId, eventType, titleText, bodyText, payload = {}) {
  await query(
    `INSERT INTO notification_logs (user_id, channel, event_type, status, title, body, payload, sent_at)
     VALUES ($1, 'in_app', $2, 'sent', $3, $4, $5, NOW())`,
    [userId, eventType, titleText, bodyText, JSON.stringify(payload)]
  );
}

// Handle webhook events from LINE
function parseWebhookSignature(body, signature) {
  if (!isConfigured) return false;
  return line.validateSignature(body, channelSecret, signature);
}

module.exports = { notify, notifyInApp, sendToUser, parseWebhookSignature, isConfigured };
