const express = require('express');
const line = require('@line/bot-sdk');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Store conversation history per user (in-memory, resets on restart)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

async function getChatResponse(userId, userMessage) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }

  const history = conversationHistory.get(userId);
  history.push({ role: 'user', content: userMessage });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: '你是一個友善且實用的 LINE 聊天機器人助手，使用繁體中文回答。請盡量簡潔清楚。',
    messages: history,
  });

  const assistantMessage = response.content[0].text;
  history.push({ role: 'assistant', content: assistantMessage });

  return assistantMessage;
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // Special commands
  if (userMessage === '/reset' || userMessage === '清除記憶') {
    conversationHistory.delete(userId);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '✅ 對話記憶已清除，我們可以重新開始！' }],
    });
    return;
  }

  try {
    const reply = await getChatResponse(userId, userMessage);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: reply }],
    });
  } catch (error) {
    console.error('Error getting AI response:', error);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '抱歉，目前無法處理您的訊息，請稍後再試。' }],
    });
  }
}

// LINE webhook endpoint
router.post(
  '/webhook',
  line.middleware(lineConfig),
  async (req, res) => {
    try {
      const events = req.body.events;
      await Promise.all(events.map(handleEvent));
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Health check
router.get('/health', (req, res) => {
  const configured =
    !!lineConfig.channelAccessToken &&
    !!lineConfig.channelSecret &&
    !!process.env.ANTHROPIC_API_KEY;
  res.json({
    status: configured ? 'ready' : 'missing_config',
    line: !!lineConfig.channelAccessToken && !!lineConfig.channelSecret,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
});

module.exports = router;
