'use strict';
/**
 * run_manual_push.js — 人工快讯录入 & 推送
 *
 * 从环境变量读取快讯内容，推送至企微，并存入数据库供周报使用。
 *
 * 环境变量（由 GitHub Actions workflow_dispatch inputs 传入）：
 *   MANUAL_TITLE       快讯标题（必填）
 *   MANUAL_DETAIL      内容摘要（必填）
 *   MANUAL_URL         原文链接（可选）
 *   MANUAL_SOURCE      来源名称（默认：人工录入）
 *   MANUAL_CATEGORY    业务分类（默认：合规）
 *   MANUAL_SCORE       Alpha评分 0-100（默认：80）
 *   MANUAL_IMPACT      影响方向：利好/利空/中性（默认：中性）
 *   MANUAL_BITV_ACTION 对 BitV 的行动建议（可选）
 */

require('dotenv').config();
const axios = require('axios');

const WECOM_WEBHOOK_URL = (process.env.WECOM_WEBHOOK_URL || '').trim();

// ── 读取输入 ──────────────────────────────────────────────────────────────────
const title      = (process.env.MANUAL_TITLE   || '').trim();
const detail     = (process.env.MANUAL_DETAIL  || '').trim();
const url        = (process.env.MANUAL_URL     || '').trim();
const source     = (process.env.MANUAL_SOURCE  || '人工录入').trim();
const category   = (process.env.MANUAL_CATEGORY || '合规').trim();
const score      = parseInt(process.env.MANUAL_SCORE || '80', 10);
const impact     = (process.env.MANUAL_IMPACT  || '中性').trim();
const bitvAction = (process.env.MANUAL_BITV_ACTION || '').trim();

if (!title || !detail) {
  console.error('[ManualPush] 标题和内容摘要为必填项，请检查输入。');
  process.exit(1);
}

// ── 格式化企微消息 ─────────────────────────────────────────────────────────────
function buildWeComMessage() {
  const scoreEmoji = score >= 90 ? '🔥' : score >= 70 ? '⭐️' : '📡';
  const impactTag  = impact === '利好' ? '🟢 利好' : impact === '利空' ? '🔴 利空' : '⚪️ 中性';
  const timeStr    = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let msg = `${scoreEmoji} **人工快讯 | ${category}**\n\n`;
  msg    += `**${title}**\n\n`;
  msg    += `> ${detail}\n\n`;
  msg    += `📌 来源：**${source}**  |  ${impactTag}  |  评分：\`${score}\`\n`;
  if (url) msg += `🔗 [阅读原文](${url})\n`;
  if (bitvAction) msg += `\n💡 **建议：** ${bitvAction}\n`;
  msg    += `\n---\n*Web3Watch HK 人工录入 | ${timeStr}*`;

  return msg;
}

// ── 推送企微 ──────────────────────────────────────────────────────────────────
async function pushToWeCom(content) {
  if (!WECOM_WEBHOOK_URL) {
    console.warn('[ManualPush] 未配置 WECOM_WEBHOOK_URL，跳过企微推送。');
    return false;
  }

  const res = await axios.post(WECOM_WEBHOOK_URL, {
    msgtype: 'markdown',
    markdown: { content },
  });

  const errcode = res.data?.errcode;
  if (errcode !== 0) {
    console.error(`[ManualPush] 企微推送失败：errcode=${errcode}, errmsg=${res.data?.errmsg}`);
    return false;
  }

  console.log('[ManualPush] 企微推送成功。');
  return true;
}

// ── 存入数据库 ────────────────────────────────────────────────────────────────
async function saveToDatabase() {
  try {
    const { saveNews } = require('./db');

    const item = {
      title,
      content:             detail,
      detail,
      url:                 url || `manual-${Date.now()}`,
      source,
      timestamp:           Date.now(),
      business_category:   category,
      competitor_category: '其他',
      alpha_score:         score,
      impact,
      bitv_action:         bitvAction,
      is_important:        score >= 75 ? 1 : 0,
      trend_reference:     '',
    };

    await saveNews([item]);
    console.log('[ManualPush] 已存入数据库，将出现在下次周报中。');
  } catch (err) {
    // 数据库存储失败不影响推送
    console.warn('[ManualPush] 数据库存储失败（不影响推送）:', err.message);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('[ManualPush] 开始处理人工快讯...');
  console.log(`[ManualPush] 标题: ${title}`);
  console.log(`[ManualPush] 来源: ${source} | 分类: ${category} | 评分: ${score}`);

  const message = buildWeComMessage();

  // 并行：推送企微 + 存入数据库
  const [pushed] = await Promise.all([
    pushToWeCom(message),
    saveToDatabase(),
  ]);

  if (pushed) {
    console.log('[ManualPush] 完成。');
  } else {
    console.error('[ManualPush] 推送失败，请检查 Webhook 配置。');
    process.exit(1);
  }
})();
