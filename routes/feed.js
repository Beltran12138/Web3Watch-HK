'use strict';

/**
 * routes/feed.js — RSS 输出接口
 *
 * 提供经 AI 分类后的高价值情报 RSS 订阅源
 * 让团队成员用 Feedly/Reeder 等阅读器订阅，减少依赖 WeCom 推送
 */

const express = require('express');

const router = express.Router();

// 从数据库获取新闻（支持 Supabase 自动回退）
const { getNews } = require('../db');

/**
 * 生成 RSS 2.0 格式的 XML
 */
function generateRSS(items, options = {}) {
  const {
    title = 'Alpha Radar - 行业情报',
    description = 'Web3/Crypto 行业情报聚合系统 - AI 分类高价值情报',
    link = process.env.APP_URL || 'http://localhost:3001',
    language = 'zh-CN',
    ttl = 60, // 更新间隔（分钟）
  } = options;

  const buildDate = new Date().toUTCString();

  // XML 头部
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n`;
  xml += `<channel>\n`;

  // Channel 元数据
  xml += `  <title>${escapeXml(title)}</title>\n`;
  xml += `  <description>${escapeXml(description)}</description>\n`;
  xml += `  <link>${escapeXml(link)}</link>\n`;
  xml += `  <language>${language}</language>\n`;
  xml += `  <lastBuildDate>${buildDate}</lastBuildDate>\n`;
  xml += `  <ttl>${ttl}</ttl>\n`;
  xml += `  <atom:link href="${escapeXml(link)}/api/feed.rss" rel="self" type="application/rss+xml"/>\n`;

  // Items
  for (const item of items) {
    xml += `  <item>\n`;
    xml += `    <title>${escapeXml(item.title)}</title>\n`;
    xml += `    <description>${escapeXml(item.detail || item.content || '')}</description>\n`;
    xml += `    <link>${escapeXml(item.url || '#')}</link>\n`;
    xml += `    <guid isPermaLink="false">${escapeXml(item.id || item.title)}-${item.timestamp}</guid>\n`;
    xml += `    <pubDate>${new Date(item.timestamp).toUTCString()}</pubDate>\n`;
    xml += `    <source>${escapeXml(item.source)}</source>\n`;

    // 自定义字段
    if (item.alpha_score) {
      xml += `    <alpha:score>${item.alpha_score}</alpha:score>\n`;
    }
    if (item.business_category) {
      xml += `    <alpha:category>${escapeXml(item.business_category)}</alpha:category>\n`;
    }
    if (item.impact) {
      xml += `    <alpha:impact>${escapeXml(item.impact)}</alpha:impact>\n`;
    }

    // 完整内容（可选）
    if (item.content) {
      xml += `    <content:encoded><![CDATA[${formatContent(item)}]]></content:encoded>\n`;
    }

    xml += `  </item>\n`;
  }

  xml += `</channel>\n`;
  xml += `</rss>\n`;

  return xml;
}

/**
 * 转义 XML 特殊字符
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 格式化内容为 HTML（用于 content:encoded）
 */
function formatContent(item) {
  const scoreEmoji = item.alpha_score >= 85 ? '🔴' : item.alpha_score >= 60 ? '🟡' : '🔵';
  const scoreLabel = item.alpha_score >= 85 ? '[紧急]' : item.alpha_score >= 60 ? '[重要]' : '[关注]';

  let html = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <div style="margin-bottom: 16px;">
    <span style="background: ${getScoreColor(item.alpha_score)}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
      ${scoreEmoji} ${scoreLabel} (评分：${item.alpha_score})
    </span>
  </div>
  <p><strong>来源：</strong> ${escapeXml(item.source)}</p>
  <p><strong>分类：</strong> ${escapeXml(item.business_category || '未分类')}</p>
  <p><strong>影响：</strong> ${escapeXml(item.impact || '中性')}</p>
  ${item.detail ? `<p><strong>摘要：</strong> ${escapeXml(item.detail)}</p>` : ''}
  ${item.bitv_action ? `<p><strong>建议行动：</strong> ${escapeXml(item.bitv_action)}</p>` : ''}
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;"/>
  <p><a href="${escapeXml(item.url)}" style="color: #0066cc;">查看原文链接 →</a></p>
</div>
`.trim();

  return html;
}

/**
 * 根据评分获取颜色
 */
function getScoreColor(score) {
  if (score >= 85) return '#dc2626';
  if (score >= 60) return '#f59e0b';
  return '#3b82f6';
}

/**
 * @swagger
 * /api/feed.rss:
 *   get:
 *     summary: 获取高价值情报 RSS 订阅源
 *     tags: [Feed]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回条目数量上限
 *       - in: query
 *         name: min_score
 *         schema:
 *           type: integer
 *           default: 60
 *         description: 最小 alpha_score 过滤
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: 按业务分类过滤
 *     produces:
 *       - application/rss+xml
 *     responses:
 *       200:
 *         description: RSS 订阅源
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 */
router.get('/feed.rss', async (req, res) => {
  try {
    const {
      limit = 50,
      min_score = 60,
      category,
      source,
    } = req.query;

    const minScore = parseInt(min_score) || 60;
    const maxLimit = parseInt(limit) || 50;

    // 使用 getNews 兼容 Supabase（生产）和 SQLite（本地）
    let items = await getNews(maxLimit * 3, source || null, 0, '');

    // 内存过滤：重要条目 OR 高分
    items = items.filter(item => item.is_important || (item.alpha_score || 0) >= minScore);
    if (category) items = items.filter(item => item.business_category === category);
    items = items.slice(0, maxLimit);

    // 生成 RSS
    const rssXml = generateRSS(items, {
      title: `Alpha Radar - 行业情报 (${category || '全部'})`,
      description: `Web3/Crypto 行业情报聚合系统 - AI 分类高价值情报 | 最低评分：${min_score}`,
      link: process.env.APP_URL || 'http://localhost:3001',
    });

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300'); // 5 分钟缓存
    res.send(rssXml);
  } catch (err) {
    console.error('[RSS] Error generating feed:', err.message);
    res.status(500).send('Error generating RSS feed');
  }
});

/**
 * @swagger
 * /api/feed.json:
 *   get:
 *     summary: 获取高价值情报 JSON 格式（用于程序化消费）
 *     tags: [Feed]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回条目数量上限
 *       - in: query
 *         name: min_score
 *         schema:
 *           type: integer
 *           default: 60
 *         description: 最小 alpha_score 过滤
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: JSON 格式情报列表
 */
router.get('/feed.json', async (req, res) => {
  try {
    const {
      limit = 50,
      min_score = 60,
    } = req.query;

    const minScore = parseInt(min_score) || 60;
    const maxLimit = parseInt(limit) || 50;

    let items = await getNews(maxLimit * 3, null, 0, '');
    items = items.filter(item => item.is_important || (item.alpha_score || 0) >= minScore);
    items = items.slice(0, maxLimit);

    res.json({
      success: true,
      data: items,
      count: items.length,
      generatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[Feed] Error fetching data:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
