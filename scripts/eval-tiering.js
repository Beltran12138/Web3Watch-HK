'use strict';
/**
 * scripts/eval-tiering.js — 用人工周报条目回测 lib/tiering.js
 *
 * 用法：node scripts/eval-tiering.js <backtest.csv> <news.json> [--from=YYYY-MM-DD --to=YYYY-MM-DD] [--list]
 *   backtest.csv  人工周报条目与数据库匹配结果（含 bucket, verdict, first_id）
 *   news.json     数据库行数组（id,title,detail,source,timestamp）
 * 标准答案属内部数据，不入库；本脚本只读本地文件。
 */

const fs = require('fs');
const { classify } = require('../lib/tiering');

const [csvPath, newsPath, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  const h = head.map(s => s.replace(/^﻿/, ''));
  return body.filter(r => r.length === h.length).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

const gold  = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const news  = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
const byId  = new Map(news.map(n => [String(n.id), n]));

// ── 1. 召回：人工条目在数据库里的首条匹配行，会被分到哪一层 ────────────────
const EXPECT = { HK_REG: 'A', HK_COMP_CORE: 'A', OFFSHORE_PRODUCT: 'B', HK_OTHER: 'C' };
const PUSH   = new Set(['A', 'B']);
const stat = {};
const misses = [];
for (const g of gold) {
  if (g.verdict !== 'FOUND' || !EXPECT[g.bucket]) continue;
  const n = byId.get(g.first_id);
  if (!n) continue;
  const { tier } = classify(n);
  const s = stat[g.bucket] ||= { n: 0, exact: 0, pushed: 0, surfaced: 0 };
  s.n++;
  if (tier === EXPECT[g.bucket]) s.exact++;
  if (PUSH.has(tier)) s.pushed++;
  if (tier) s.surfaced++;
  if (EXPECT[g.bucket] !== 'C' && !PUSH.has(tier)) misses.push(`${g.bucket} [${tier}] ${n.source}: ${(n.title || '').replace(/\s+/g, ' ').slice(0, 90)}`);
}
console.log('── 召回（按人工 bucket；pushed = 被分到 A/B）');
for (const [b, s] of Object.entries(stat)) {
  console.log(`${b.padEnd(17)} n=${String(s.n).padStart(3)}  层级一致 ${pct(s.exact, s.n)}  推送 ${pct(s.pushed, s.n)}  进候选(任一层) ${pct(s.surfaced, s.n)}`);
}
const ab = Object.entries(stat).filter(([b]) => EXPECT[b] !== 'C').reduce((a, [, s]) => [a[0] + s.pushed, a[1] + s.n], [0, 0]);
console.log(`A+B 应推条目推送召回：${pct(ab[0], ab[1])} (${ab[0]}/${ab[1]})`);

// ── 2. 量：时间窗内每层每天多少条（同标题去重）────────────────────────────
if (opt.from && opt.to) {
  const from = Date.parse(opt.from), to = Date.parse(opt.to);
  const days = (to - from) / 864e5;
  const seen = new Set(); const tiers = { A: [], B: [], C: [], FLASH: [] };
  for (const n of news) {
    if (!(n.timestamp >= from && n.timestamp < to)) continue;
    const key = (n.title || '').replace(/\s+/g, '').slice(0, 40);
    if (seen.has(key)) continue; seen.add(key);
    const { tier } = classify(n);
    if (tier) tiers[tier].push(n);
  }
  console.log(`\n── 量（${opt.from} ~ ${opt.to}，${days} 天，同标题去重）`);
  for (const [t, arr] of Object.entries(tiers)) console.log(`${t.padEnd(5)} ${arr.length} 条，${(arr.length / days).toFixed(1)}/天`);
  if (opt.list) {
    for (const [t, arr] of Object.entries(tiers)) {
      console.log(`\n[${t}]`);
      arr.sort((a, b) => a.timestamp - b.timestamp)
        .forEach(n => console.log(`  ${new Date(n.timestamp).toISOString().slice(5, 10)} ${n.source.padEnd(12)} ${(n.title || '').replace(/\s+/g, ' ').slice(0, 88)}`));
    }
  }
}

if (opt.misses) { console.log('\n── 漏推（A/B 应推但未推）'); misses.forEach(m => console.log('  ' + m)); }

function pct(a, b) { return b ? `${(100 * a / b).toFixed(0)}%` : '—'; }
