'use strict';

/**
 * Webhook 集成示例
 * 展示如何将 Alpha Radar 集成到第三方系统
 */

const express = require('express');
const crypto = require('crypto');
const logger = require('../lib/logger');

/**
 * 示例 1: 接收 Alpha Radar 的推送
 */
function createWebhookReceiver() {
  const app = express();
  app.use(express.json());

  // 验证签名（如果配置了 webhook secret）
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  function verifySignature(payload, signature) {
    if (!WEBHOOK_SECRET) return true;

    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }

  // 接收新闻推送
  app.post('/webhook/news', (req, res) => {
    const signature = req.headers['x-webhook-signature'];

    if (!verifySignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    switch (event) {
      case 'news.created':
        handleNewsCreated(data);
        break;
      case 'news.important':
        handleImportantNews(data);
        break;
      case 'report.daily':
        handleDailyReport(data);
        break;
      case 'report.weekly':
        handleWeeklyReport(data);
        break;
      default:
        logger.warn({ event }, 'Unknown webhook event');
    }

    res.json({ received: true });
  });

  return app;
}

// 处理新新闻
function handleNewsCreated(data) {
  logger.info({ title: data.title, source: data.source }, 'New news received');

  // 这里可以：
  // 1. 发送到企业微信/钉钉/Slack
  // 2. 存储到自己的数据库
  // 3. 触发其他业务逻辑
  // 4. 发送到消息队列
}

// 处理重要新闻
function handleImportantNews(data) {
  logger.info({ title: data.title, score: data.alpha_score }, 'Important news received');

  // 重要新闻可以特殊处理：
  // 1. 发送短信/电话通知
  // 2. 创建紧急工单
  // 3. 触发交易系统的风控检查
}

// 处理日报
function handleDailyReport(data) {
  logger.info({ date: data.date, items: data.items.length }, 'Daily report received');

  // 可以：
  // 1. 发送到邮件列表
  // 2. 归档到云存储
  // 3. 生成 PDF 报告
}

// 处理周报
function handleWeeklyReport(data) {
  logger.info({ week: data.week, items: data.items.length }, 'Weekly report received');

  // 可以：
  // 1. 发送给管理层
  // 2. 更新仪表板
  // 3. 触发数据分析流程
}

/**
 * 示例 2: 向 Alpha Radar 发送事件
 */
async function sendEventToAlphaRadar(event, data) {
  const axios = require('axios');

  const ALPHA_RADAR_URL = process.env.ALPHA_RADAR_URL || 'http://localhost:3001';
  const API_KEY = process.env.ALPHA_RADAR_API_KEY;

  try {
    const response = await axios.post(`${ALPHA_RADAR_URL}/api/events`, {
      event,
      data,
      timestamp: Date.now(),
    }, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });

    return response.data;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to send event to Alpha Radar');
    throw error;
  }
}

/**
 * 示例 3: 与 CI/CD 集成
 */
async function notifyDeployment() {
  await sendEventToAlphaRadar('system.deployment', {
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    timestamp: Date.now(),
  });
}

// 如果直接运行此文件
if (require.main === module) {
  const app = createWebhookReceiver();
  const PORT = process.env.PORT || 3002;

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Webhook receiver started');
  });
}

module.exports = {
  createWebhookReceiver,
  handleNewsCreated,
  handleImportantNews,
  handleDailyReport,
  handleWeeklyReport,
  sendEventToAlphaRadar,
  notifyDeployment,
};
