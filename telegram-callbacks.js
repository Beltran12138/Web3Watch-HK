'use strict';

/**
 * telegram-callbacks.js — Telegram Bot 回调处理器
 *
 * 功能：
 *   1. 处理 inline button 回调（查看详情/标记已读/原文链接）
 *   2. Webhook 服务器监听 Telegram 回调
 *   3. 支持命令重置和状态管理
 *
 * 配置：
 *   TELEGRAM_BOT_TOKEN=xxx
 *   TELEGRAM_WEBHOOK_PORT=8080 (可选，默认 8080)
 */

const express = require('express');
const axios = require('axios');
const { db } = require('./db');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const TELEGRAM_CONFIG = {
  TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  WEBHOOK_PORT: process.env.TELEGRAM_WEBHOOK_PORT || 8080,
  WEBHOOK_PATH: '/api/telegram/webhook',
};

// ── 回调数据缓存 ────────────────────────────────────────────────────────────
const callbackCache = new Map(); // messageId -> item data
const userState = new Map(); // userId -> { action, timestamp }

// ── Telegram API 客户端 ─────────────────────────────────────────────────────
class TelegramCallbackClient {
  constructor() {
    this.token = TELEGRAM_CONFIG.TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    this.enabled = !!this.token;
  }

  /**
   * 发送 API 请求
   */
  async request(endpoint, data = {}) {
    if (!this.enabled) {
      console.warn('[Telegram] Not configured, skipping request');
      return null;
    }

    try {
      const res = await axios.post(`${this.baseUrl}/${endpoint}`, data, {
        timeout: 10000,
      });
      return res.data;
    } catch (err) {
      console.error(`[Telegram] API error (${endpoint}):`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * 回答回调查询
   */
  async answerCallbackQuery(callbackQueryId, text = null, showAlert = false) {
    return await this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * 编辑消息（移除按钮或更新内容）
   */
  async editMessageText(chatId, messageId, text, replyMarkup = null) {
    return await this.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });
  }

  /**
   * 编辑回复标记（移除按钮）
   */
  async editMessageReplyMarkup(chatId, messageId, replyMarkup = null) {
    return await this.request('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
  }

  /**
   * 删除消息
   */
  async deleteMessage(chatId, messageId) {
    return await this.request('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(chatId, text, options = {}) {
    return await this.request('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...options,
    });
  }
}

// ── 回调处理器 ──────────────────────────────────────────────────────────────
class TelegramCallbackHandler {
  constructor() {
    this.client = new TelegramCallbackClient();
    this.app = express();
    this.app.use(express.json());
  }

  /**
   * 设置 Webhook
   */
  async setupWebhook(publicUrl) {
    if (!this.client.enabled) {
      console.warn('[Telegram] Cannot setup webhook: bot not configured');
      return false;
    }

    const webhookUrl = `${publicUrl}${TELEGRAM_CONFIG.WEBHOOK_PATH}`;

    try {
      const result = await this.client.request('setWebhook', {
        url: webhookUrl,
        allowed_updates: ['callback_query', 'message'],
      });

      if (result.ok) {
        console.log(`[Telegram] Webhook set to: ${webhookUrl}`);
        return true;
      } else {
        console.error('[Telegram] Failed to set webhook:', result);
        return false;
      }
    } catch (err) {
      console.error('[Telegram] Setup webhook error:', err.message);
      return false;
    }
  }

  /**
   * 获取 Webhook 信息
   */
  async getWebhookInfo() {
    return await this.client.request('getWebhookInfo');
  }

  /**
   * 处理回调查询
   */
  async handleCallbackQuery(callbackQuery) {
    const {
      id: callbackQueryId,
      from,
      message,
      data,
    } = callbackQuery;

    const userId = from.id;
    const userName = from.username || from.first_name;
    const [action, itemId] = data.split(':');

    console.log(`[Telegram] Callback: ${action} from ${userName} (${userId}) for item ${itemId}`);

    try {
      switch (action) {
        case 'view':
          await this.handleViewDetail(callbackQueryId, message, itemId);
          break;

        case 'mark_read':
          await this.handleMarkRead(callbackQueryId, message, itemId);
          break;

        case 'source_link':
          await this.handleSourceLink(callbackQueryId, message, itemId);
          break;

        case 'dismiss':
          await this.handleDismiss(callbackQueryId, message);
          break;

        default:
          console.warn(`[Telegram] Unknown action: ${action}`);
          await this.client.answerCallbackQuery(callbackQueryId, '未知操作', true);
      }
    } catch (err) {
      console.error('[Telegram] Handle callback error:', err.message);
      await this.client.answerCallbackQuery(callbackQueryId, '处理失败，请稍后再试', true);
    }
  }

  /**
   * 处理"查看详情"回调
   */
  async handleViewDetail(callbackQueryId, message, itemId) {
    // 获取情报详情
    const item = await this.getItemById(itemId);
    if (!item) {
      await this.client.answerCallbackQuery(callbackQueryId, '情报不存在', true);
      return;
    }

    // 构建详细消息
    const detailText = `📊 **情报详情**

**标题**: ${item.title}
**来源**: ${item.source}
**评分**: ${item.alpha_score}/100
**分类**: ${item.business_category || '未分类'}
**影响**: ${item.impact || '中性'}

**摘要**:
${item.detail || item.content || '(无详细内容)'}

**建议行动**:
${item.bitv_action || '关注后续发展'}

---
*查看于 ${new Date().toLocaleString('zh-CN')}*`;

    // 编辑原消息，添加详细内容
    await this.client.editMessageText(
      message.chat.id,
      message.message_id,
      detailText,
      {
        inline_keyboard: [
          [
            {
              text: '🔗 原文链接',
              url: item.url,
            },
            {
              text: '✅ 标记已读',
              callback_data: `mark_read:${itemId}`,
            },
          ],
          [
            {
              text: '❌ 关闭',
              callback_data: `dismiss:`,
            },
          ],
        ],
      }
    );

    await this.client.answerCallbackQuery(callbackQueryId, '已加载详情');
  }

  /**
   * 处理"标记已读"回调
   */
  async handleMarkRead(callbackQueryId, message, itemId) {
    // 更新数据库状态
    const stmt = db.prepare('UPDATE news SET sent_to_wecom = 1 WHERE id = ?');
    stmt.run(itemId);

    // 编辑消息，移除按钮
    await this.client.editMessageReplyMarkup(message.chat.id, message.message_id, null);

    // 发送确认消息
    await this.client.sendMessage(
      message.chat.id,
      `✅ 已标记为已读\n_情报 ID: ${itemId}_`,
      { disable_notification: true }
    );

    await this.client.answerCallbackQuery(callbackQueryId, '已标记为已读');
  }

  /**
   * 处理"原文链接"回调
   */
  async handleSourceLink(callbackQueryId, message, itemId) {
    const item = await this.getItemById(itemId);
    if (!item) {
      await this.client.answerCallbackQuery(callbackQueryId, '情报不存在', true);
      return;
    }

    // 直接回答，让用户浏览器跳转
    await this.client.answerCallbackQuery(callbackQueryId, null, false, {
      url: item.url,
    });
  }

  /**
   * 处理"关闭/移除"回调
   */
  async handleDismiss(callbackQueryId, message) {
    try {
      await this.client.deleteMessage(message.chat.id, message.message_id);
      await this.client.answerCallbackQuery(callbackQueryId, '已关闭');
    } catch (err) {
      console.error('[Telegram] Delete message error:', err.message);
      await this.client.answerCallbackQuery(callbackQueryId, '无法删除消息', true);
    }
  }

  /**
   * 从数据库获取情报
   */
  async getItemById(itemId) {
    try {
      const stmt = db.prepare('SELECT * FROM news WHERE id = ?');
      return stmt.get(itemId);
    } catch (err) {
      console.error('[Telegram] Get item error:', err.message);
      return null;
    }
  }

  /**
   * 启动 Webhook 服务器
   */
  startServer() {
    // 处理 webhook 请求
    this.app.post(TELEGRAM_CONFIG.WEBHOOK_PATH, async (req, res) => {
      const update = req.body;

      // 处理回调查询
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }

      // 处理普通消息（命令等）
      if (update.message) {
        await this.handleMessage(update.message);
      }

      res.status(200).send('OK');
    });

    // 健康检查端点
    this.app.get('/api/telegram/health', (req, res) => {
      res.json({
        enabled: this.client.enabled,
        webhookPath: TELEGRAM_CONFIG.WEBHOOK_PATH,
        port: TELEGRAM_CONFIG.WEBHOOK_PORT,
      });
    });

    // 启动服务器
    const port = TELEGRAM_CONFIG.WEBHOOK_PORT;
    this.app.listen(port, () => {
      console.log(`[Telegram] Callback server listening on port ${port}`);
    });
  }

  /**
   * 处理普通消息（命令）
   */
  async handleMessage(message) {
    const { chat, from, text } = message;

    if (!text || !text.startsWith('/')) return;

    const command = text.split(' ')[0].toLowerCase();
    const userId = from.id;

    // 速率限制：每个用户每分钟最多 5 个命令
    const now = Date.now();
    const userLastCommand = userState.get(userId)?.timestamp || 0;
    if (now - userLastCommand < 12000) { // 12 秒冷却
      await this.client.sendMessage(chat.id, '⚠️ 操作过于频繁，请稍后再试');
      return;
    }

    userState.set(userId, { action: command, timestamp: now });

    switch (command) {
      case '/start':
        await this.handleStartCommand(chat.id, from);
        break;

      case '/help':
        await this.handleHelpCommand(chat.id);
        break;

      case '/status':
        await this.handleStatusCommand(chat.id);
        break;

      case '/reset':
        await this.handleResetCommand(chat.id, userId);
        break;

      default:
        await this.client.sendMessage(chat.id, '❓ 未知命令。使用 /help 查看可用命令。');
    }
  }

  /**
   * /start 命令
   */
  async handleStartCommand(chatId, from) {
    const welcomeText = `👋 欢迎使用 Alpha Radar!

我是您的 Web3/Crypto 情报助手，为您提供：

✅ 实时行业情报推送
✅ AI 智能分类与评分
✅ 多渠道推送支持

使用 /help 查看所有命令。

*您收到的第一条情报即将送达...*`;

    await this.client.sendMessage(chatId, welcomeText);
  }

  /**
   * /help 命令
   */
  async handleHelpCommand(chatId) {
    const helpText = `📖 **可用命令**

/start - 开始使用
/help - 显示此帮助信息
/status - 查看系统状态
/reset - 重置用户状态

**推送的情报支持以下操作:**

- 🔍 **查看详情** - 显示完整情报分析
- ✅ **标记已读** - 标记为已处理
- 🔗 **原文链接** - 跳转到原始来源
- ❌ **关闭** - 移除消息

---
*Alpha Radar - 您的情报中枢*`;

    await this.client.sendMessage(chatId, helpText);
  }

  /**
   * /status 命令
   */
  async handleStatusCommand(chatId) {
    try {
      // 获取统计数据
      const statsStmt = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN alpha_score >= 85 THEN 1 ELSE 0 END) as critical,
          AVG(alpha_score) as avg_score
        FROM news
        WHERE timestamp > datetime('now', '-24 hours')
      `);
      const stats = statsStmt.get();

      const statusText = `📊 **系统状态**

**过去 24 小时**:
- 总情报数：${stats?.total || 0}
- 紧急情报：${stats?.critical || 0}
- 平均评分：${(stats?.avg_score || 0).toFixed(1)}

**运行时间**: ${process.uptime().toFixed(0)} 秒

*最后更新：${new Date().toLocaleString('zh-CN')}*`;

      await this.client.sendMessage(chatId, statusText);
    } catch (err) {
      console.error('[Telegram] Get status error:', err.message);
      await this.client.sendMessage(chatId, '❌ 获取状态失败');
    }
  }

  /**
   * /reset 命令
   */
  async handleResetCommand(chatId, userId) {
    userState.delete(userId);
    await this.client.sendMessage(chatId, '✅ 用户状态已重置');
  }
}

// ── 导出单例 ─────────────────────────────────────────────────────────────────
const telegramCallbackHandler = new TelegramCallbackHandler();

module.exports = {
  telegramCallbackHandler,
  TelegramCallbackHandler,
  TelegramCallbackClient,
};
