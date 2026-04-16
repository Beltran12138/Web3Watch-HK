'use strict';
/**
 * qclaw-skill.js — QClaw 技能入口
 *
 * QClaw 通过企业微信收到消息后，调用本脚本查询 Alpha-Radar 情报数据。
 *
 * 用法（QClaw Skills 配置里填写命令）：
 *   node C:/Users/lenovo/alpha-radar/qclaw-skill.js "查询合规动态"
 *   node C:/Users/lenovo/alpha-radar/qclaw-skill.js "搜索 BTC"
 *   node C:/Users/lenovo/alpha-radar/qclaw-skill.js "日报"
 *   node C:/Users/lenovo/alpha-radar/qclaw-skill.js "统计"
 *   node C:/Users/lenovo/alpha-radar/qclaw-skill.js "抓取"
 *
 * 输出：纯文本（QClaw 读取 stdout 发送到企微群）
 */

// 静默加载 .env（避免 dotenv 的提示信息污染输出给企微）
process.env.DOTENV_KEY = process.env.DOTENV_KEY || '';
require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, 'alpha_radar.db');
const query = (process.argv[2] || '').trim();

// ── 主入口 ───────────────────────────────────────────────────────────────────
async function main() {
  if (!query) {
    print(HELP_TEXT);
    return;
  }

  const q = query.toLowerCase();

  // 路由命令
  if (matchAny(q, ['日报', 'daily', '今日报告', '今天报告'])) {
    await runDailyReport();
  } else if (matchAny(q, ['周报', 'weekly', '本周报告'])) {
    await runWeeklyReport();
  } else if (matchAny(q, ['抓取', 'scrape', '拉取', '立即抓取', '手动抓取'])) {
    await runScrape();
  } else if (matchAny(q, ['统计', 'stats', '数据统计', '概况'])) {
    await showStats();
  } else if (q.startsWith('搜索') || q.startsWith('search ') || q.startsWith('查找') || q.startsWith('找')) {
    const keyword = q.replace(/^(搜索|search|查找|找)\s*/, '').trim();
    await searchNews(keyword);
  } else if (matchAny(q, ['帮助', 'help', '?', '？', '命令'])) {
    print(HELP_TEXT);
  } else {
    // 默认：按分类/关键词查最新情报
    await queryLatestNews(query);
  }
}

// ── 帮助文本 ─────────────────────────────────────────────────────────────────
const HELP_TEXT = `📡 Alpha-Radar 情报助手

可用命令：
• 查最新情报 / 合规 / 市场 / 技术 → 按分类查看最新高分情报
• 搜索 <关键词>   → 全文搜索情报
• 统计            → 查看数据概况
• 日报            → 生成今日情报日报
• 周报            → 生成本周情报周报
• 抓取            → 立即抓取最新情报

示例：
  合规动态
  搜索 SFC 监管
  统计
  日报`;

// ── 查最新情报 ───────────────────────────────────────────────────────────────
async function queryLatestNews(rawQuery) {
  const db = openDB();
  // 优先查24h，无数据则扩展到72h
  let since = Date.now() - 24 * 3600 * 1000;
  let timeLabel = '24小时';

  // 判断是否是分类词
  const categoryMap = {
    '合规': '合规', '监管': '合规', '牌照': '合规', 'sfc': '合规',
    '市场': '市场行情', '价格': '市场行情', '行情': '市场行情',
    '技术': '技术', '开发': '技术', '链上': '技术',
    '产品': '产品', '上线': '产品',
    '竞争': '竞争动态', '交易所': '竞争动态',
  };

  const matchedCat = Object.entries(categoryMap).find(([k]) =>
    rawQuery.toLowerCase().includes(k)
  );

  let rows;
  if (matchedCat) {
    rows = db.prepare(`
      SELECT title, alpha_score, detail, source, business_category, impact, url, timestamp
      FROM news
      WHERE timestamp >= ? AND business_category LIKE ?
      ORDER BY alpha_score DESC, timestamp DESC
      LIMIT 5
    `).all(since, `%${matchedCat[1]}%`);
  } else {
    // 无匹配分类 → 返回综合高分情报
    rows = db.prepare(`
      SELECT title, alpha_score, detail, source, business_category, impact, url, timestamp
      FROM news
      WHERE timestamp >= ? AND alpha_score >= 60
      ORDER BY alpha_score DESC, timestamp DESC
      LIMIT 5
    `).all(since);
  }

  // 24h 无数据时扩展到 72h
  if (!rows.length) {
    since = Date.now() - 72 * 3600 * 1000;
    timeLabel = '72小时';
    if (matchedCat) {
      rows = db.prepare(`
        SELECT title, alpha_score, detail, source, business_category, impact, url, timestamp
        FROM news WHERE timestamp >= ? AND business_category LIKE ?
        ORDER BY alpha_score DESC, timestamp DESC LIMIT 5
      `).all(since, `%${matchedCat[1]}%`);
    } else {
      rows = db.prepare(`
        SELECT title, alpha_score, detail, source, business_category, impact, url, timestamp
        FROM news WHERE timestamp >= ? AND alpha_score >= 60
        ORDER BY alpha_score DESC, timestamp DESC LIMIT 5
      `).all(since);
    }
  }

  db.close();

  if (!rows.length) {
    print('📭 近期暂无相关情报。\n发送「抓取」立即拉取最新数据。');
    return;
  }

  const label = matchedCat ? `「${matchedCat[1]}」分类` : '综合高分';
  let out = `📡 过去${timeLabel} ${label} 情报（Top ${rows.length}）\n${'─'.repeat(30)}\n\n`;

  rows.forEach((r, i) => {
    const emoji = r.alpha_score >= 90 ? '🔥' : r.alpha_score >= 70 ? '⭐' : '📌';
    const impact = r.impact === '利好' ? '📈' : r.impact === '利空' ? '📉' : '➖';
    const time = formatTime(r.timestamp);
    out += `${emoji} [${r.alpha_score}分] ${r.title}\n`;
    if (r.detail) out += `   ${r.detail}\n`;
    out += `   ${impact} ${r.impact || '中性'} | 来源: ${r.source} | ${time}\n`;
    if (i < rows.length - 1) out += '\n';
  });

  print(out);
}

// ── 搜索情报 ─────────────────────────────────────────────────────────────────
async function searchNews(keyword) {
  if (!keyword) {
    print('请提供搜索关键词，例如：搜索 SFC 监管');
    return;
  }

  const db = openDB();
  const rows = db.prepare(`
    SELECT title, alpha_score, detail, source, business_category, impact, timestamp
    FROM news
    WHERE (title LIKE ? OR content LIKE ? OR detail LIKE ?)
      AND alpha_score >= 40
    ORDER BY alpha_score DESC, timestamp DESC
    LIMIT 8
  `).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);

  if (!rows.length) {
    db.close();
    print(`🔍 未找到包含「${keyword}」的情报。\n\n建议：\n• 检查关键词拼写\n• 尝试更短的关键词\n• 发送「抓取」获取最新数据后再搜索`);
    return;
  }

  db.close();
  let out = `🔍 「${keyword}」搜索结果（共 ${rows.length} 条）\n${'─'.repeat(30)}\n\n`;

  rows.forEach((r, i) => {
    const emoji = r.alpha_score >= 90 ? '🔥' : r.alpha_score >= 70 ? '⭐' : '📌';
    const time = formatTime(r.timestamp);
    out += `${emoji} [${r.alpha_score}分] ${r.title}\n`;
    if (r.detail) out += `   ${r.detail}\n`;
    out += `   分类: ${r.business_category || '未分类'} | 来源: ${r.source} | ${time}\n`;
    if (i < rows.length - 1) out += '\n';
  });

  print(out);
}

// ── 统计概况 ─────────────────────────────────────────────────────────────────
async function showStats() {
  const db = openDB();
  const now = Date.now();
  const day1 = now - 24 * 3600 * 1000;
  const day7 = now - 7 * 24 * 3600 * 1000;

  const total24h = db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp >= ?').get(day1).n;
  const important24h = db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp >= ? AND alpha_score >= 70').get(day1).n;
  const critical24h = db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp >= ? AND alpha_score >= 90').get(day1).n;
  const total7d = db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp >= ?').get(day7).n;

  // 获取数据库最新一条的时间，提示数据新鲜度
  const latest = db.prepare('SELECT timestamp FROM news ORDER BY timestamp DESC LIMIT 1').get();
  const latestAge = latest ? Math.floor((now - latest.timestamp) / 3600000) : null;

  const topSources = db.prepare(`
    SELECT source, COUNT(*) as n
    FROM news WHERE timestamp >= ?
    GROUP BY source ORDER BY n DESC LIMIT 5
  `).all(day1);

  const topCats = db.prepare(`
    SELECT business_category, COUNT(*) as n, AVG(alpha_score) as avg_score
    FROM news WHERE timestamp >= ? AND business_category IS NOT NULL AND business_category != ''
    GROUP BY business_category ORDER BY n DESC LIMIT 5
  `).all(day1);

  const topItems = db.prepare(`
    SELECT title, alpha_score, source FROM news
    WHERE timestamp >= ? AND alpha_score >= 70
    ORDER BY alpha_score DESC LIMIT 3
  `).all(day1);

  db.close();

  let out = `📊 Alpha-Radar 情报统计\n${'─'.repeat(30)}\n`;
  if (latestAge !== null) {
    out += latestAge < 2 ? `🟢 数据新鲜（${latestAge}小时前更新）\n\n` :
           latestAge < 12 ? `🟡 数据较新（${latestAge}小时前更新）\n\n` :
           `🔴 数据较旧（${latestAge}小时前更新），建议发「抓取」\n\n`;
  } else {
    out += '\n';
  }
  out += `📅 过去 24 小时\n`;
  out += `   总情报: ${total24h} 条\n`;
  out += `   重要 (≥70分): ${important24h} 条\n`;
  out += `   紧急 (≥90分): ${critical24h} 条\n\n`;
  out += `📅 过去 7 天: ${total7d} 条情报\n\n`;

  if (topItems.length) {
    out += `🔥 今日最高分情报\n`;
    topItems.forEach(r => {
      out += `   [${r.alpha_score}] ${r.title.slice(0, 40)}${r.title.length > 40 ? '…' : ''}\n`;
    });
    out += '\n';
  }

  if (topCats.length) {
    out += `📂 今日分类分布\n`;
    topCats.forEach(c => {
      out += `   ${c.business_category}: ${c.n}条 (均分${Math.round(c.avg_score)})\n`;
    });
    out += '\n';
  }

  if (topSources.length) {
    out += `📰 今日活跃来源\n`;
    topSources.forEach(s => out += `   ${s.source}: ${s.n}条\n`);
  }

  print(out);
}

// ── 生成日报 ─────────────────────────────────────────────────────────────────
async function runDailyReport() {
  print('📋 正在生成今日情报日报，请稍候...');
  try {
    execSync('node run_daily_report.js', {
      cwd: __dirname,
      timeout: 120000,
      stdio: 'pipe',
    });
    print('✅ 日报已生成并推送到企微，请查看群消息。');
  } catch (err) {
    print(`❌ 日报生成失败: ${err.message.slice(0, 100)}\n\n请检查 DEEPSEEK_API_KEY 是否配置正确。`);
  }
}

// ── 生成周报 ─────────────────────────────────────────────────────────────────
async function runWeeklyReport() {
  print('📅 正在生成本周情报周报，请稍候（可能需要1-2分钟）...');
  try {
    execSync('node run_weekly_report.js', {
      cwd: __dirname,
      timeout: 180000,
      stdio: 'pipe',
    });
    print('✅ 周报已生成并推送到企微，请查看群消息。');
  } catch (err) {
    print(`❌ 周报生成失败: ${err.message.slice(0, 100)}`);
  }
}

// ── 手动抓取 ─────────────────────────────────────────────────────────────────
async function runScrape() {
  print('🕷️ 正在触发情报抓取，预计需要2-3分钟...\n抓取完成后重要情报会直接推送到本群。');
  try {
    execSync('node scrapers/index.js --tier=high', {
      cwd: __dirname,
      timeout: 180000,
      stdio: 'pipe',
    });
    print('✅ 抓取完成！重要情报已推送。\n发送「统计」查看本次更新数据。');
  } catch (err) {
    print(`⚠️ 抓取任务已启动（后台运行中），预计2-3分钟后情报会陆续推入群。`);
  }
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function openDB() {
  return new Database(DB_PATH, { readonly: true });
}

function print(text) {
  process.stdout.write(text + '\n');
}

function matchAny(str, keywords) {
  return keywords.some(k => str.includes(k));
}

function formatTime(ts) {
  if (!ts) return '未知时间';
  const d = new Date(ts);
  const now = new Date();
  const diffH = Math.floor((now - d) / 3600000);
  if (diffH < 1) return '刚刚';
  if (diffH < 24) return `${diffH}小时前`;
  return `${Math.floor(diffH / 24)}天前`;
}

// ── 执行 ─────────────────────────────────────────────────────────────────────
main().catch(err => {
  print(`❌ 执行出错: ${err.message}`);
  process.exit(1);
});
