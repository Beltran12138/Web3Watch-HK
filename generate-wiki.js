'use strict';
/**
 * generate-wiki.js — 自动更新 wiki/ 知识库
 *
 * 从 Supabase 读取：
 *   - insights 表 → 全量重写 wiki/市场趋势.md
 *   - news 表近 30 天 → 按来源/类别追加到竞品/监管页面的「📡 最新动态」区块
 *
 * 用法：node generate-wiki.js
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);

const WIKI = path.join(__dirname, 'wiki');

function bjDate(ts) {
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '-');
}

function today() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '-');
}

// ── 数据获取 ─────────────────────────────────────────────────────────────────

async function fetchInsights() {
  const { data, error } = await supabase
    .from('insights')
    .select('trend_key, summary, evidence_count, last_updated')
    .order('last_updated', { ascending: false })
    .limit(30);
  if (error) throw new Error(`insights fetch failed: ${error.message}`);
  return data || [];
}

async function fetchRecentNews(days = 30) {
  const since = Date.now() - days * 86400000;
  const { data, error } = await supabase
    .from('news')
    .select('title, url, source, business_category, alpha_score, timestamp, impact')
    .gte('timestamp', since)
    .gte('alpha_score', 60)
    .order('alpha_score', { ascending: false })
    .limit(200);
  if (error) throw new Error(`news fetch failed: ${error.message}`);
  return data || [];
}

// ── 生成器 ────────────────────────────────────────────────────────────────────

function generateTrendsPage(insights) {
  const date = today();
  const items = insights.map(i => {
    const updated = bjDate(i.last_updated);
    return `### ${i.trend_key}\n\n${i.summary}\n\n> 佐证文章数: ${i.evidence_count} · 最近更新: ${updated}\n`;
  }).join('\n---\n\n');

  return `---
title: 市场趋势速览
category: trends
auto_generated: true
last_updated: ${date}
sources: [Web3Watch-HK Supabase insights]
---

# 市场趋势速览（AI 自动更新）

> ⚡ 本页由 Web3Watch-HK 每周自动生成，来源：DeepSeek AI 提取的长期行业趋势。
> 上次更新：${date}

${items || '_暂无趋势数据_'}
`;
}

const SECTION_START = '<!-- AUTO_NEWS_START -->';
const SECTION_END   = '<!-- AUTO_NEWS_END -->';

function buildNewsSection(articles, label) {
  if (articles.length === 0) return '';
  const lines = articles.slice(0, 10).map(a => {
    const date  = bjDate(a.timestamp);
    const score = a.alpha_score ? ` | Alpha ${a.alpha_score}` : '';
    return `- **[${a.title}](${a.url})** (${date}${score})`;
  });
  return `${SECTION_START}
## 📡 最新动态（自动更新）

> 来源：Web3Watch-HK · 近30天 Alpha≥60 文章 · 上次更新：${today()}

${lines.join('\n')}

${SECTION_END}`;
}

function upsertSection(filePath, section) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const start = content.indexOf(SECTION_START);
  const end   = content.indexOf(SECTION_END);

  if (start !== -1 && end !== -1) {
    content = content.slice(0, start) + section + content.slice(end + SECTION_END.length);
  } else {
    content = content.trimEnd() + '\n\n' + section;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[Wiki] Updated: ${path.relative(__dirname, filePath)}`);
}

// ── 主逻辑 ────────────────────────────────────────────────────────────────────

const SOURCE_FILTERS = {
  'wiki/竞品分析/HashKey.md': n => /hashkey/i.test(n.source) || /hashkey/i.test(n.title),
  'wiki/竞品分析/OSL.md':     n => /osl/i.test(n.source)     || /\bosl\b/i.test(n.title),
  'wiki/监管/香港SFC.md':     n => /sfc|证监会|监管|合规|牌照/i.test(n.title) ||
                                    /SFC|regulator|compliance/i.test(n.business_category || ''),
};

(async () => {
  console.log('[Wiki] Starting wiki auto-update...');

  const [insights, news] = await Promise.all([fetchInsights(), fetchRecentNews(30)]);
  console.log(`[Wiki] Fetched ${insights.length} insights, ${news.length} news articles`);

  // 1. 全量覆写市场趋势
  const trendsPath = path.join(WIKI, '市场趋势.md');
  if (insights.length > 0) {
    fs.writeFileSync(trendsPath, generateTrendsPage(insights), 'utf8');
    console.log('[Wiki] Regenerated: wiki/市场趋势.md');
  } else {
    console.log('[Wiki] No insights data, skipping 市场趋势.md');
  }

  // 2. 追加/替换各页面最新动态区块
  for (const [relPath, filter] of Object.entries(SOURCE_FILTERS)) {
    const filePath = path.join(__dirname, relPath);
    const filtered = news.filter(filter);
    const section  = buildNewsSection(filtered, relPath);
    if (section) upsertSection(filePath, section);
  }

  console.log('[Wiki] Done.');
})();
