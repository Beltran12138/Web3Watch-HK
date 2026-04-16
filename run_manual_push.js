'use strict';
/**
 * run_manual_push.js — 快讯人工录入 & 推送
 *
 * 从环境变量读取标题/链接/分类，调用 AI 生成摘要与评分，
 * 推送至企微，并存入数据库供周报使用。
 */

require('dotenv').config();
const axios = require('axios');

const WECOM_WEBHOOK_URL = (process.env.WECOM_WEBHOOK_URL || '').trim();

const title    = (process.env.MANUAL_TITLE    || '').trim();
const url      = (process.env.MANUAL_URL      || '').trim();
const category = (process.env.MANUAL_CATEGORY || '合规').trim();

if (!title) {
  console.error('[ManualPush] 标题为必填项。');
  process.exit(1);
}

// ── AI 分析（生成摘要、评分、建议）────────────────────────────────────────────
async function analyzeWithAI() {
  try {
    const { processWithAI } = require('./ai-enhanced');
    const result = await processWithAI(title, '', category);
    return result;
  } catch (err) {
    console.warn('[ManualPush] AI 分析失败，使用默认值:', err.message);
    return {
      detail:      title,
      alpha_score: 75,
      impact:      '中性',
      bitv_action: '',
    };
  }
}

// ── 推送企微 ──────────────────────────────────────────────────────────────────
async function pushToWeCom(item) {
  if (!WECOM_WEBHOOK_URL) {
    console.warn('[ManualPush] 未配置 WECOM_WEBHOOK_URL，跳过。');
    return false;
  }

  const scoreEmoji = item.alpha_score >= 90 ? '🔥' : item.alpha_score >= 70 ? '⭐️' : '📡';

  let content = `${scoreEmoji} **${title}** \`${category}\` \`${item.alpha_score}\`\n\n`;
  if (item.detail && item.detail !== title) content += `> ${item.detail}\n\n`;
  if (url) content += `🔗 [阅读原文](${url})\n`;
  if (item.bitv_action) content += `\n💡 **建议：** ${item.bitv_action}`;

  const res = await axios.post(WECOM_WEBHOOK_URL, {
    msgtype:  'markdown',
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
async function saveToDatabase(item) {
  try {
    const { saveNews } = require('./db');
    await saveNews([{
      title,
      content:             item.detail || title,
      detail:              item.detail || title,
      url:                 url || `manual-${Date.now()}`,
      source:              '人工录入',
      timestamp:           Date.now(),
      business_category:   category,
      competitor_category: item.competitor_category || '其他',
      alpha_score:         item.alpha_score,
      impact:              item.impact || '中性',
      bitv_action:         item.bitv_action || '',
      is_important:        item.alpha_score >= 75 ? 1 : 0,
      trend_reference:     '',
    }]);
    console.log('[ManualPush] 已存入数据库，将出现在下次周报中。');
  } catch (err) {
    console.warn('[ManualPush] 数据库存储失败（不影响推送）:', err.message);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`[ManualPush] 标题: ${title} | 分类: ${category}`);

  const aiResult = await analyzeWithAI();
  console.log(`[ManualPush] AI评分: ${aiResult.alpha_score} | 影响: ${aiResult.impact}`);

  const [pushed] = await Promise.all([
    pushToWeCom(aiResult),
    saveToDatabase(aiResult),
  ]);

  if (!pushed) process.exit(1);
  console.log('[ManualPush] 完成。');
})();
