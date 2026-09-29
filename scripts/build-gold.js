'use strict';
/**
 * scripts/build-gold.js — 把人工周报条目转成精选评测样本（格式同 AIHOT 的 gold.jsonl）
 *
 * 用法：
 *   node scripts/build-gold.js --dir=<goldset 目录> [--holdout-from=2026-07-24] [--rules-hit=160] [--entity=120] [--random=200] [--seed=20260929]
 *
 * <goldset 目录> 里要有（均为内部数据，不入库）：
 *   backtest_baseline_*.csv      周报条目与数据库的首条匹配（row_idx, period, bucket, verdict, first_id …）
 *   backtest_matches_*.json      每条周报条目匹配到的全部数据库 id（row_idx → {verdict, ids}）
 *   news_dump_*.json             数据库导出（id, title, content, detail, source, timestamp, alpha_score, is_important …）
 *   labels_override*.csv         可选：人工改标（news_id, decision[, note]），decision = select | reject | either，空着的行忽略
 * 输出到同一目录：gold.jsonl（每行一条）和 gold_meta.json（抽样分母、权重、切分说明）。
 *
 * 标注口径：
 *   select  周报条目在数据库里的首条匹配（模型看到的是抓到的原文，不是周报里改写过的标题）
 *   either  同一周报条目的其余匹配、UNSURE 条目的候选、与正例标题几乎相同的报道（同一件事的别家报道，不计分）
 *   reject  周报时间窗内、没进周报的其余新闻（分层抽样，见 samplingStratum 与 weight）
 * 切分按周报期次的开始日：早于 --holdout-from 为 development，其余为 holdout。按时间切而不随机切，
 * 同一件事的报道不会同时落在两边。
 */

const fs = require('fs');
const path = require('path');
const { classify } = require('../lib/tiering');

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
if (!opt.dir) { console.error('需要 --dir=<goldset 目录>'); process.exit(1); }
const DIR = opt.dir;
const HOLDOUT_FROM = Date.parse(`${opt['holdout-from'] || '2026-07-24'}T00:00:00+08:00`);
const N_RULES_HIT = Number(opt['rules-hit'] || 160);
const N_ENTITY = Number(opt.entity || 120);
const N_RANDOM = Number(opt.random || 200);
let seed = Number(opt.seed || 20260929);

const latest = prefix => {
  const f = fs.readdirSync(DIR).filter(n => n.startsWith(prefix)).sort().at(-1);
  if (!f) throw new Error(`${DIR} 里没有 ${prefix}*`);
  return path.join(DIR, f);
};

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
  const h = head.map(s => s.replace(/^\uFEFF/, ''));
  return body.filter(r => r.length === h.length).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

// 周报期次 "0327-0409" / "05.22-05.29" → 北京时间 [开始日 00:00, 结束日 23:59:59]
function windowOf(period) {
  const m = period.replace(/\./g, '').match(/(\d\d)(\d\d)-(\d\d)(\d\d)/);
  if (!m) throw new Error(`看不懂的期次：${period}`);
  return [Date.parse(`2026-${m[1]}-${m[2]}T00:00:00+08:00`), Date.parse(`2026-${m[3]}-${m[4]}T23:59:59+08:00`)];
}

// 信源 → 分级与一手性（对应 AIHOT 的 sourceFacts；门槛按分级区分）
const OFFICIAL = new Set(['Binance', 'OKX', 'Bybit', 'Bitget', 'Gate', 'KuCoin', 'MEXC', 'HTX', 'HashKeyExchange', 'HashKeyGroup', 'OSL', 'Exio', 'Matrixport', 'SFC']);
const EXEC_ACCOUNTS = new Set(['XieJiayin']); // 交易所高管本人
function sourceFacts(source) {
  if (OFFICIAL.has(source)) return { sourceKind: 'official', sourceTier: 'T1', firstParty: true };
  if (EXEC_ACCOUNTS.has(source)) return { sourceKind: 'x', sourceTier: 'T1_5', firstParty: true };
  return { sourceKind: 'media', sourceTier: 'T2', firstParty: false };
}

// 与正例几乎相同的标题（同一件事的别家报道）：字二元组 Jaccard
const norm = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function bigrams(s) { const t = norm(s); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
function jaccard(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); }
const NEAR_DUP = 0.5;

// 反例的分层：规则会放行的（最难，直接考规则的误报）、提到重点机构但规则没放行的、其余
const ENTITY = /hashkey|\bOSL\b|EX\.?IO|证监会|證監會|\bSFC\b|金管局|\bHKMA\b|香港|Hong Kong|binance|币安|\bOKX\b|bybit|bitget|\bgate\b|kucoin|\bMEXC\b|\bHTX\b|火币/i;
function stratumOf(n) {
  const { tier } = classify(n);
  if (tier) return 'neg_rules_hit';
  if (ENTITY.test(`${n.title || ''} ${n.content || ''}`)) return 'neg_entity';
  return 'neg_random';
}

function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function sample(arr, k) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

const backtest = parseCsv(fs.readFileSync(latest('backtest_baseline_'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(latest('backtest_matches_'), 'utf8'));
const news = JSON.parse(fs.readFileSync(latest('news_dump_'), 'utf8'));
const byId = new Map(news.map(n => [String(n.id), n]));
// 人工改标：目录里所有 labels_override*.csv（decision 空着的行忽略）
const overrides = new Map();
for (const f of fs.readdirSync(DIR).filter(n => n.startsWith('labels_override') && n.endsWith('.csv')).sort()) {
  for (const r of parseCsv(fs.readFileSync(path.join(DIR, f), 'utf8'))) if (r.decision) overrides.set(String(r.news_id), r);
}

const splitOf = start => (start < HOLDOUT_FROM ? 'development' : 'holdout');
const cases = new Map(); // news id → case

function material(n) {
  const body = String(n.content || n.detail || '').trim();
  const zh = /[一-鿿]/.test(`${n.title}${body}`);
  return {
    title: String(n.title || '').replace(/\s+/g, ' ').trim(),
    originalTitle: null,
    publishedAt: new Date(n.timestamp).toISOString(),
    sourceName: n.source,
    bodyZh: zh && body ? body : null,
    bodyOriginal: !zh && body ? body : null,
  };
}

function put(n, decision, ctx) {
  const id = String(n.id);
  const prev = cases.get(id);
  // select 优先于 either，either 优先于 reject
  const rank = { select: 3, either: 2, reject: 1 };
  if (prev && rank[prev.gold.decision] >= rank[decision]) return;
  cases.set(id, {
    caseId: `w3w-${id}`,
    newsId: Number(n.id),
    material: material(n),
    sourceFacts: { ...sourceFacts(n.source), language: /[一-鿿]/.test(n.title || '') ? 'zh' : 'en' },
    samplingContext: { benchmarkSplit: ctx.split, samplingStratum: ctx.stratum, weight: ctx.weight ?? 1, period: ctx.period },
    gold: { decision, ...(ctx.bucket ? { bucket: ctx.bucket } : {}), ...(ctx.headline ? { weeklyHeadline: ctx.headline } : {}) },
    legacy: { alphaScore: n.alpha_score ?? null, isImportant: n.is_important ?? null },
  });
}

// ── 1. 正例与同事件的别家报道 ─────────────────────────────────────────────────
const windows = new Map(); // period → [start, end]
const stats = { weeklyRows: 0, found: 0, notFound: 0, unsure: 0, dup: 0 };
const positiveBigrams = [];
for (const r of backtest) {
  windows.set(r.period, windowOf(r.period));
  stats.weeklyRows++;
  const [start] = windowOf(r.period);
  const split = splitOf(start);
  const m = matches[r.row_idx];
  if (r.verdict === 'dup') { stats.dup++; continue; }
  if (r.verdict === 'NOT_FOUND') { stats.notFound++; continue; }
  const ids = (m?.ids || []).map(String).filter(id => byId.has(id));
  if (r.verdict === 'FOUND') {
    stats.found++;
    const first = byId.get(String(r.first_id)) || byId.get(ids[0]);
    if (!first) continue;
    put(first, 'select', { split, stratum: r.bucket, period: r.period, bucket: r.bucket, headline: r.headline });
    positiveBigrams.push(bigrams(first.title));
    for (const id of ids) if (id !== String(first.id)) put(byId.get(id), 'either', { split, stratum: 'same_event', period: r.period });
  } else if (r.verdict === 'UNSURE') {
    stats.unsure++;
    for (const id of ids) put(byId.get(id), 'either', { split, stratum: 'unsure', period: r.period });
  }
}

// ── 2. 反例：周报时间窗内的其余新闻，按层抽样 ─────────────────────────────────
const pool = { development: {}, holdout: {} };
const seenTitle = new Set([...cases.values()].map(c => norm(c.material.title).slice(0, 40)));
for (const n of news.slice().sort((a, b) => a.id - b.id)) {
  const id = String(n.id);
  if (cases.has(id) || !n.title) continue;
  const period = [...windows].find(([, [a, b]]) => n.timestamp >= a && n.timestamp <= b)?.[0];
  if (!period) continue;
  const key = norm(n.title).slice(0, 40);
  if (seenTitle.has(key)) continue; // 同标题只留一条
  seenTitle.add(key);
  const bg = bigrams(n.title);
  if (positiveBigrams.some(p => jaccard(bg, p) >= NEAR_DUP)) {
    put(n, 'either', { split: splitOf(windows.get(period)[0]), stratum: 'near_dup', period });
    continue;
  }
  const split = splitOf(windows.get(period)[0]);
  const stratum = stratumOf(n);
  (pool[split][stratum] ||= []).push({ n, period });
}

// 名额（两个切分合计，按池大小分到两边）：规则放行层最能暴露误报，多抽
const meta = { builtAt: new Date().toISOString(), holdoutFrom: new Date(HOLDOUT_FROM).toISOString(), seed: Number(opt.seed || 20260929), stats, pool: {}, sampled: {} };
for (const split of ['development', 'holdout']) {
  meta.pool[split] = Object.fromEntries(Object.entries(pool[split]).map(([s, a]) => [s, a.length]));
}
const total = s => (pool.development[s]?.length || 0) + (pool.holdout[s]?.length || 0);
const quota = { neg_rules_hit: N_RULES_HIT, neg_entity: N_ENTITY, neg_random: N_RANDOM };
for (const split of ['development', 'holdout']) {
  meta.sampled[split] = {};
  for (const [stratum, k] of Object.entries(quota)) {
    const arr = pool[split][stratum] || [];
    const share = Math.round(k * arr.length / Math.max(1, total(stratum)));
    const picked = sample(arr, Math.min(share, arr.length));
    const weight = picked.length ? arr.length / picked.length : 0;
    meta.sampled[split][stratum] = { pool: arr.length, sampled: picked.length, weight: Number(weight.toFixed(3)) };
    for (const { n, period } of picked) put(n, 'reject', { split, stratum, period, weight: Number(weight.toFixed(3)) });
  }
}

// ── 3. 模型判为周报同一件事的反例改标 either（scripts/gold-same-event.js），再人工改标 ────────
const sameEventPath = path.join(DIR, 'same_event_llm.json');
const sameEvent = fs.existsSync(sameEventPath) ? JSON.parse(fs.readFileSync(sameEventPath, 'utf8')) : {};
let sameEventMarked = 0;
for (const [id, f] of Object.entries(sameEvent)) {
  const c = cases.get(String(id));
  if (!c || c.gold.decision !== 'reject') continue;
  c.gold = { decision: 'either', sameEventRow: f.row_idx };
  c.samplingContext.samplingStratum = `${c.samplingContext.samplingStratum}>same_event_llm`;
  sameEventMarked++;
}
meta.sameEventMarked = sameEventMarked;

let overridden = 0;
for (const [id, o] of overrides) {
  const c = cases.get(id);
  if (!c || !['select', 'reject', 'either'].includes(o.decision.trim())) continue;
  c.gold = { ...c.gold, decision: o.decision.trim(), override: o.note || true };
  overridden++;
}
meta.overridden = overridden;

const out = [...cases.values()].sort((a, b) => a.newsId - b.newsId);
fs.writeFileSync(path.join(DIR, 'gold.jsonl'), out.map(c => JSON.stringify(c)).join('\n') + '\n');
const count = {};
for (const c of out) {
  const k = `${c.samplingContext.benchmarkSplit}/${c.gold.decision}`;
  count[k] = (count[k] || 0) + 1;
}
meta.cases = count;
fs.writeFileSync(path.join(DIR, 'gold_meta.json'), JSON.stringify(meta, null, 1));
console.log(JSON.stringify({ stats, cases: count, sampled: meta.sampled }, null, 1));
