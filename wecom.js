const axios = require('axios');
require('dotenv').config();

const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL;

/**
 * 推送消息到企业微信
 */
async function sendToWeCom(item) {
  if (!WECOM_WEBHOOK_URL) {
    console.warn('[WeCom] No Webhook URL found, skipping push.');
    return;
  }

  // 构建消息模板（Markdown 格式，适配企业微信机器人）
  const content = `
### 🚀 行业情报快报
**【${item.business_category || '快讯'}】** ${item.title}

> **详情：** ${item.detail || '暂无详情'}
> **来源：** ${item.source}
> **链接：** [查看原文](${item.url})

---
*由 Alpha-Radar 智能抓取并推送*
  `.trim();

  try {
    await axios.post(WECOM_WEBHOOK_URL, {
      msgtype: 'markdown',
      markdown: { content }
    });
    console.log(`[WeCom] Sent: ${item.title}`);
  } catch (err) {
    console.error('[WeCom Error]:', err.message);
  }
}

module.exports = { sendToWeCom };
