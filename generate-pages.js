'use strict';
/**
 * generate-pages.js — GitHub Pages 静态日报生成器
 *
 * 从 Supabase 读取近 30 天重要情报，生成 docs/index.html
 * 供 GitHub Pages 公开展示，让面试官 / 合作方直接看到系统实际输出。
 *
 * 用法：
 *   node generate-pages.js
 *   node generate-pages.js --days=7
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DAYS    = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '30', 10);
const DOCS    = path.join(__dirname, 'docs');
const REPORTS = path.join(DOCS, 'reports');

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);

// ── 数据获取 ──────────────────────────────────────────────────────────────────

async function fetchRecentNews(days) {
  const since = Date.now() - days * 86400000;
  const { data, error } = await supabase
    .from('news')
    .select('id,title,detail,source,timestamp,business_category,alpha_score,is_important,impact,bitv_action,url')
    .gte('timestamp', since)
    .or('alpha_score.gte.60,is_important.eq.true')
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data || [];
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

function bjDate(ts) {
  return new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(s) {
  if (s >= 90) return '#d32f2f';
  if (s >= 75) return '#f57c00';
  if (s >= 60) return '#388e3c';
  return '#757575';
}

function scoreBadge(s) {
  if (!s) return '';
  const color = scoreColor(s);
  return `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:700;background:${color}20;color:${color};border:1px solid ${color}50;">${s}</span>`;
}

function impactBadge(impact) {
  const map = { '利好': ['#388e3c', '📈'], '利空': ['#d32f2f', '📉'], '中性': ['#757575', '➡️'] };
  const [color, icon] = map[impact] || ['#757575', ''];
  return impact ? `<span style="font-size:11px;color:${color};">${icon} ${impact}</span>` : '';
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CATEGORY_ICONS = {
  '合规': '⚖️', 'RWA': '🏢', '稳定币/平台币': '💵',
  '投融资': '💰', '交易/量化/AI': '🤖', '钱包/支付': '💳',
  'toB/机构': '🏦', '合约': '📊', '公链': '🔗',
  '法币兑换': '🔄', '理财': '📈', '拉新/社媒/社群/pr': '📣',
  '经纪/OTC/托管': '🤝', '大零户/VIP': '👑', '学院/社交/内容/活动': '🎓',
};

// ── HTML 生成 ─────────────────────────────────────────────────────────────────

function buildNewsCard(item) {
  const cat  = item.business_category || '未分类';
  const icon = CATEGORY_ICONS[cat] || '📰';
  const link = item.url ? `href="${escHtml(item.url)}" target="_blank" rel="noopener"` : '';

  return `
<article class="card" data-score="${item.alpha_score || 0}" data-cat="${escHtml(cat)}">
  <div class="card-meta">
    <span class="cat-badge">${icon} ${escHtml(cat)}</span>
    ${scoreBadge(item.alpha_score)}
    ${impactBadge(item.impact)}
    <span class="source-time">${escHtml(item.source)} · ${formatTime(item.timestamp)}</span>
  </div>
  <h3 class="card-title">
    ${link ? `<a ${link}>${escHtml(item.title)}</a>` : escHtml(item.title)}
  </h3>
  ${item.detail ? `<p class="card-detail">${escHtml(item.detail)}</p>` : ''}
  ${item.bitv_action ? `<div class="card-action">💡 ${escHtml(item.bitv_action)}</div>` : ''}
</article>`;
}

function buildDayPage(dateStr, items, allDates) {
  const dateLabel = new Date(dateStr + 'T12:00:00+08:00').toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const top    = items.filter(i => i.alpha_score >= 75);
  const others = items.filter(i => i.alpha_score < 75 || !i.alpha_score);

  const archiveLinks = allDates.map(d => {
    const active = d === dateStr ? ' class="active"' : '';
    return `<a href="${d}.html"${active}>${d}</a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Web3Watch HK | ${dateStr}</title>
${commonStyles()}
</head>
<body>
${header(dateStr)}
<div class="layout">
  <aside class="sidebar">
    <h4>📅 历史存档</h4>
    <nav class="archive-nav">${archiveLinks}</nav>
    <div class="sidebar-foot">
      <a href="https://github.com/Beltran12138/Web3Watch-HK" target="_blank" rel="noopener">GitHub →</a>
    </div>
  </aside>
  <main>
    <h2 class="day-title">${dateLabel}</h2>
    <p class="day-stats">共 <strong>${items.length}</strong> 条情报 · 重要 <strong>${top.length}</strong> 条</p>
    ${top.length > 0 ? `<h3 class="section-head">🔥 重要动态</h3>${top.map(buildNewsCard).join('')}` : ''}
    ${others.length > 0 ? `<h3 class="section-head">📡 其他动态</h3>${others.map(buildNewsCard).join('')}` : ''}
  </main>
</div>
${footer()}
</body>
</html>`;
}

function buildIndexPage(today, items, allDates, stats) {
  const dateLabel = new Date(today + 'T12:00:00+08:00').toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const top    = items.filter(i => i.alpha_score >= 75);
  const others = items.filter(i => i.alpha_score < 75 || !i.alpha_score);

  const archiveLinks = allDates.map(d => {
    const active = d === today ? ' class="active"' : '';
    return `<a href="reports/${d}.html"${active}>${d}</a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Web3Watch HK — 香港 Web3 行业情报系统</title>
${commonStyles()}
</head>
<body>
${header(today)}
<div class="hero-stats">
  <div class="stat"><span>${stats.sources}</span>数据源</div>
  <div class="stat"><span>${stats.total30d}+</span>近30天情报</div>
  <div class="stat"><span>${stats.important30d}</span>重要事件</div>
  <div class="stat"><span>每15分钟</span>更新频率</div>
</div>
<div class="layout">
  <aside class="sidebar">
    <h4>📅 历史存档</h4>
    <nav class="archive-nav">${archiveLinks}</nav>
    <div class="sidebar-foot">
      <a href="https://github.com/Beltran12138/Web3Watch-HK" target="_blank" rel="noopener">GitHub →</a>
    </div>
  </aside>
  <main>
    <h2 class="day-title">今日情报 · ${dateLabel}</h2>
    <p class="day-stats">共 <strong>${items.length}</strong> 条情报 · 重要 <strong>${top.length}</strong> 条</p>
    ${top.length > 0 ? `<h3 class="section-head">🔥 重要动态</h3>${top.map(buildNewsCard).join('')}` : '<p class="empty">今日暂无高分情报</p>'}
    ${others.length > 0 ? `<h3 class="section-head">📡 其他动态</h3>${others.map(buildNewsCard).join('')}` : ''}
  </main>
</div>
${footer()}
</body>
</html>`;
}

function commonStyles() {
  return `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f5f7fa;color:#1a1a2e;min-height:100vh}
a{color:#00A7E1;text-decoration:none}a:hover{text-decoration:underline}

/* Header */
.site-header{background:linear-gradient(135deg,#00A7E1 0%,#0077b6 100%);color:#fff;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.site-header h1{font-size:20px;font-weight:700;letter-spacing:.5px}
.header-meta{font-size:12px;opacity:.85}
.header-nav a{color:#fff;margin-left:16px;font-size:13px;opacity:.9}

/* Hero Stats */
.hero-stats{display:flex;gap:0;background:#fff;border-bottom:1px solid #e8edf2;justify-content:center}
.stat{flex:1;text-align:center;padding:16px 8px;border-right:1px solid #e8edf2}
.stat:last-child{border-right:none}
.stat span{display:block;font-size:24px;font-weight:700;color:#00A7E1}
.stat{font-size:12px;color:#666}

/* Layout */
.layout{display:grid;grid-template-columns:200px 1fr;gap:0;max-width:1200px;margin:24px auto;padding:0 16px}

/* Sidebar */
.sidebar{padding:0 16px 0 0}
.sidebar h4{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#999;margin-bottom:10px}
.archive-nav{display:flex;flex-direction:column;gap:4px}
.archive-nav a{display:block;padding:5px 10px;border-radius:6px;font-size:13px;color:#555;transition:.15s}
.archive-nav a:hover{background:#e8f4fb;color:#00A7E1;text-decoration:none}
.archive-nav a.active{background:#00A7E1;color:#fff;font-weight:600}
.sidebar-foot{margin-top:20px;font-size:12px}

/* Main */
main{min-width:0}
.day-title{font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.day-stats{font-size:13px;color:#888;margin-bottom:20px}
.section-head{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#999;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #e8edf2}

/* Card */
.card{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:12px;border:1px solid #e8edf2;transition:.2s;position:relative}
.card:hover{border-color:#00A7E1;box-shadow:0 2px 12px rgba(0,167,225,.08)}
.card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.cat-badge{font-size:12px;background:#f0f9ff;color:#00A7E1;padding:2px 8px;border-radius:10px;border:1px solid #bee3f8}
.source-time{font-size:11px;color:#aaa;margin-left:auto}
.card-title{font-size:14px;font-weight:600;line-height:1.5;color:#1a1a2e;margin-bottom:6px}
.card-title a{color:#1a1a2e}
.card-title a:hover{color:#00A7E1;text-decoration:none}
.card-detail{font-size:13px;color:#555;line-height:1.7;margin-bottom:6px}
.card-action{font-size:12px;color:#666;background:#fffbf0;border-left:3px solid #f5a623;padding:6px 10px;border-radius:0 4px 4px 0;margin-top:6px}

/* Footer */
.site-footer{background:#1a1a2e;color:#aaa;text-align:center;padding:20px;font-size:12px;margin-top:40px}
.site-footer a{color:#00A7E1}

.empty{color:#aaa;font-size:13px;padding:20px 0}

@media(max-width:700px){
  .layout{grid-template-columns:1fr}
  .sidebar{padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid #e8edf2}
  .archive-nav{flex-direction:row;flex-wrap:wrap}
  .hero-stats{flex-wrap:wrap}
  .stat{min-width:50%}
}
</style>`;
}

function header(dateStr) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  return `<header class="site-header">
  <h1>🔭 Web3Watch HK 情报系统</h1>
  <div class="header-meta">最后更新：${now}</div>
  <nav>
    <a class="header-nav" href="https://github.com/Beltran12138/Web3Watch-HK" target="_blank" rel="noopener">GitHub</a>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  Web3Watch HK · 产品部行研组 ·
  <a href="https://github.com/Beltran12138/Web3Watch-HK" target="_blank" rel="noopener">GitHub</a>
  · 数据由 DeepSeek AI 分析 · 每日 18:00 BJ 更新
</footer>`;
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`[Pages] Fetching last ${DAYS} days from Supabase…`);
  const news = await fetchRecentNews(DAYS);
  console.log(`[Pages] ${news.length} items fetched`);

  // 按日期分桶
  const byDate = {};
  for (const item of news) {
    const d = bjDate(item.timestamp);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(item);
  }

  const allDates = Object.keys(byDate).sort().reverse();
  const today    = allDates[0] || bjDate(Date.now());

  // 统计
  const stats = {
    sources:      new Set(news.map(n => n.source)).size,
    total30d:     news.length,
    important30d: news.filter(n => n.is_important || n.alpha_score >= 75).length,
  };

  // 确保目录存在
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(REPORTS, { recursive: true });

  // 生成每日存档页
  for (const [date, items] of Object.entries(byDate)) {
    const html = buildDayPage(date, items, allDates);
    fs.writeFileSync(path.join(REPORTS, `${date}.html`), html, 'utf8');
    console.log(`[Pages] reports/${date}.html (${items.length} items)`);
  }

  // 生成首页
  const todayItems = byDate[today] || [];
  const indexHtml  = buildIndexPage(today, todayItems, allDates, stats);
  fs.writeFileSync(path.join(DOCS, 'index.html'), indexHtml, 'utf8');
  console.log(`[Pages] docs/index.html → today=${today}, ${todayItems.length} items`);

  // .nojekyll 阻止 GitHub Pages 的 Jekyll 处理
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), '', 'utf8');

  console.log(`[Pages] Done. ${allDates.length} day pages + index.`);
})().catch(err => {
  console.error('[Pages] Fatal:', err.message);
  process.exit(1);
});
