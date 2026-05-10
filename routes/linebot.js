const express = require('express');
const line = require('@line/bot-sdk');
const Anthropic = require('@anthropic-ai/sdk');
const { searchTires, reloadTires } = require('../lib/tireDatabase');

const router = express.Router();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Per-user conversation history
const conversationHistory = new Map();
const MAX_HISTORY = 20;

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// ── Claude Tools ────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'search_tires',
    description: '查詢輪胎報價資料庫。當用戶詢問輪胎價格、報價、庫存或規格時使用此工具。可以依品牌、尺寸或型號查詢。',
    input_schema: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description: '輪胎品牌名稱，例如：Michelin、Bridgestone、Continental、Dunlop、Yokohama',
        },
        size: {
          type: 'string',
          description: '輪胎尺寸，例如：205/55R16、225/45R17、195/65R15',
        },
        model: {
          type: 'string',
          description: '輪胎型號或花紋名稱，例如：Pilot Sport 4、Turanza T005',
        },
      },
    },
  },
];

function executeTool(toolName, input) {
  if (toolName === 'search_tires') {
    const results = searchTires(input);
    if (results.length === 0) {
      return JSON.stringify({ found: false, message: '查無符合條件的輪胎' });
    }
    return JSON.stringify({
      found: true,
      count: results.length,
      results: results.map(t => ({
        品牌: t.brand,
        型號: t.model,
        尺寸: t.size,
        單價: `NT$ ${t.price.toLocaleString()}`,
        庫存: t.stock > 0 ? `${t.stock} 條` : '暫無現貨',
      })),
    });
  }
  return JSON.stringify({ error: '未知工具' });
}

// ── Agentic loop ─────────────────────────────────────────────────────────────

async function getChatResponse(userId, userMessage) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }

  const history = conversationHistory.get(userId);
  history.push({ role: 'user', content: userMessage });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  const messages = [...history];

  // Agentic loop: let Claude call tools until end_turn
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: `你是一個輪胎店的專業報價助理 LINE 機器人，使用繁體中文回答。
當用戶詢問輪胎相關問題時，請使用 search_tires 工具查詢資料庫後回答。
報價回覆格式請清楚列出品牌、型號、尺寸、單價（每條）和庫存。
如果找不到符合條件的輪胎，請告知用戶並建議調整搜尋條件。
非輪胎相關的問題可以正常回答。`,
      tools,
      messages,
    });

    // Collect any tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      const textBlock = response.content.find(b => b.type === 'text');
      const assistantText = textBlock ? textBlock.text : '抱歉，我無法回答這個問題。';

      // Save assistant reply to history
      history.push({ role: 'assistant', content: assistantText });
      return assistantText;
    }

    // Append assistant message (with tool_use blocks) to messages
    messages.push({ role: 'assistant', content: response.content });

    // Execute all tool calls and collect results
    const toolResults = toolUseBlocks.map(block => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: executeTool(block.name, block.input),
    }));

    messages.push({ role: 'user', content: toolResults });
  }
}

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  if (userMessage === '/reset' || userMessage === '清除記憶') {
    conversationHistory.delete(userId);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '✅ 對話記憶已清除！' }],
    });
    return;
  }

  if (userMessage === '/reload' || userMessage === '重新載入資料') {
    reloadTires();
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '✅ 輪胎資料已重新載入！' }],
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
    console.error('Error:', error);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '抱歉，目前無法處理您的訊息，請稍後再試。' }],
    });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/health', (_req, res) => {
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
