'use strict';
/**
 * scripts/eval-selection.js — 用人工周报样本评测「哪些新闻该进周报」的判断（做法同 AIHOT 的 scripts/eval-selection.ts）
 *
 * 用法：
 *   node --env-file=.env scripts/eval-selection.js --dir=<goldset 目录> [--judges=rules,legacy,llm] [--label="第一版"]
 *        [--n=0] [--concurrency=6]
 *
 * 样本由 scripts/build-gold.js 生成（<dir>/gold.jsonl）。判断方：
 *   rules-push       lib/tiering.js 分到 A/B（会推群）算入选
 *   rules-candidate  lib/tiering.js 分到任一层算入选
 *   legacy           数据库里旧的 alpha_score（门槛扫描）
 *   llm              prompts/selection-score.md，同一模型独立打两次分，均分过门槛算入选（门槛扫描）
 *
 * 留出集的用法：打分类判断方的门槛只在开发集上选（加权 F1 最高），再原样拿到留出集上看。
 * 调提示词、调规则只看开发集；留出集只在最后看，看多了它也会变成开发集。
 *
 * 加权：反例是分层抽样的，每条带 weight（=该层池大小/抽样数），加权指标估计的是「周报时间窗内全部
 * 新闻」上的表现；未加权指标只描述样本本身。either 不计分。
 * 注意口径：标准答案是「进没进周报」。周报比推群窄，rules-push 的查准率会天然偏低，它的查全率才是有效读数。
 */

const fs = require('fs');
const path = require('path');
const { classify } = require('../lib/tiering');
const { createClient, mapLimit } = require('../lib/eval-llm');

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const DIR = opt.dir;
if (!DIR) { console.error('需要 --dir=<goldset 目录>'); process.exit(1); }
const JUDGES = String(opt.judges || 'rules,legacy').split(',');
const LABEL = opt.label || '';
const SCORE_CALLS = 2;
const SWEEP = Array.from({ length: 26 }, (_, i) => 40 + i * 2);

let cases = fs.readFileSync(path.join(DIR, 'gold.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
if (Number(opt.n)) cases = cases.slice(0, Number(opt.n));
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'gold_meta.json'), 'utf8'));
const scored = cases.filter(c => c.gold.decision !== 'either');

// ── 判断方 ───────────────────────────────────────────────────────────────────
const asNews = c => ({ title: c.material.title, content: c.material.bodyZh || c.material.bodyOriginal || '', source: c.material.sourceName });

const SCORE_SYSTEM = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'selection-score.md'), 'utf8');
const MAX_BODY = 6000;
function scoreInput(c) {
  const body = (c.material.bodyZh || c.material.bodyOriginal || '').trim() || c.material.title;
  const at = new Date(c.material.publishedAt).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
  return [
    '请按系统规则评估以下单篇材料所代表的事件。只输出 attentionScore。',
    `【发布时间（北京时间）】\n${at}+08:00`,
    `【标题】\n${c.material.title}`,
    `【完整正文】\n${body.slice(0, MAX_BODY)}`,
  ].join('\n\n');
}

async function llmScores() {
  const client = createClient(path.join(DIR, '.cache', 'score'));
  const out = new Map();
  let failed = 0;
  await mapLimit(scored, Number(opt.concurrency || 6), async c => {
    const values = [];
    try {
      // 两次调用只差 attempt，缓存键不同，各自是一次独立请求
      for (let i = 1; i <= SCORE_CALLS; i++) {
        const d = await client.chatJson({ system: SCORE_SYSTEM, user: scoreInput(c), attempt: i, temperature: Number(opt.temperature ?? 0.2), maxTokens: 64 });
        const v = Number(d.attentionScore);
        if (!Number.isFinite(v)) throw new Error('bad score');
        values.push(Math.max(0, Math.min(100, Math.round(v))));
      }
      out.set(c.caseId, values);
    } catch { failed++; }
  });
  return { out, usage: client.usage, model: client.model, failed };
}

// ── 指标 ─────────────────────────────────────────────────────────────────────
const weightOf = c => (c.gold.decision === 'reject' ? Number(c.samplingContext.weight || 1) : 1);

function metrics(rows, predict) {
  const m = { tp: 0, fp: 0, fn: 0, tn: 0, wtp: 0, wfp: 0, wfn: 0, wtn: 0 };
  for (const c of rows) {
    const p = predict(c);
    if (p === null) continue;
    const w = weightOf(c);
    const g = c.gold.decision === 'select';
    const k = p ? (g ? 'tp' : 'fp') : (g ? 'fn' : 'tn');
    m[k]++; m[`w${k}`] += w;
  }
  const div = (a, b) => (b ? a / b : null);
  m.precision = div(m.tp, m.tp + m.fp);
  m.recall = div(m.tp, m.tp + m.fn);
  m.wPrecision = div(m.wtp, m.wtp + m.wfp);
  m.wF1 = m.wPrecision !== null && m.recall !== null && m.wPrecision + m.recall > 0 ? (2 * m.wPrecision * m.recall) / (m.wPrecision + m.recall) : null;
  m.accuracy = div(m.tp + m.tn, m.tp + m.tn + m.fp + m.fn);
  return m;
}

// 周报时间窗的天数（期次有重叠，取并集），用来把「加权入选数」换算成每周条数
function weeksOf(split) {
  const periods = [...new Set(cases.filter(c => c.samplingContext.benchmarkSplit === split).map(c => c.samplingContext.period))];
  const days = new Set();
  for (const p of periods) {
    const m = p.replace(/\./g, '').match(/(\d\d)(\d\d)-(\d\d)(\d\d)/);
    for (let t = Date.parse(`2026-${m[1]}-${m[2]}T12:00:00+08:00`); t <= Date.parse(`2026-${m[3]}-${m[4]}T12:00:00+08:00`); t += 864e5) days.add(t);
  }
  return days.size / 7;
}

const pct = v => (v === null ? '  —  ' : `${(100 * v).toFixed(1).padStart(5)}%`);
const bySplit = split => scored.filter(c => c.samplingContext.benchmarkSplit === split);

function line(name, m, weeks) {
  const perWeek = (m.wtp + m.wfp) / weeks;
  return `${name.padEnd(22)} 查全 ${pct(m.recall)}  查准(样本) ${pct(m.precision)}  查准(加权) ${pct(m.wPrecision)}  F1(加权) ${pct(m.wF1)}  ≈${perWeek.toFixed(1).padStart(5)} 条/周  [tp ${m.tp} fp ${m.fp} fn ${m.fn}]`;
}

function strata(rows, predict) {
  const s = {};
  for (const c of rows) {
    const p = predict(c);
    if (p === null) continue;
    const k = `${c.gold.decision}:${c.samplingContext.samplingStratum}`;
    const x = s[k] ||= { n: 0, selected: 0 };
    x.n++; if (p) x.selected++;
  }
  return s;
}

(async () => {
  const report = { label: LABEL, at: new Date().toISOString(), gold: { cases: meta.cases, holdoutFrom: meta.holdoutFrom, builtAt: meta.builtAt }, judges: {} };
  const weeks = { development: weeksOf('development'), holdout: weeksOf('holdout') };
  const md = [];
  const log = s => { console.log(s); md.push(s); };

  log(`# 精选评测 ${LABEL}  (${report.at.slice(0, 16)})`);
  log(`样本：开发集 ${bySplit('development').length} 条、留出集 ${bySplit('holdout').length} 条计分（either 不计）；时间窗 开发 ${weeks.development.toFixed(1)} 周、留出 ${weeks.holdout.toFixed(1)} 周`);
  const st = meta.stats;
  log(`分母提醒：周报 ${st.found + st.notFound} 条（去 dup、UNSURE）里只有 ${st.found} 条在数据库里找得到（${pct(st.found / (st.found + st.notFound))}）。下面的查全率都是「抓到了的前提下」，端到端还要乘上这个比例。\n`);

  const predictors = {};
  if (JUDGES.includes('rules')) {
    const tiers = new Map(scored.map(c => [c.caseId, classify(asNews(c)).tier]));
    predictors['rules-push'] = { predict: c => ['A', 'B'].includes(tiers.get(c.caseId)) };
    predictors['rules-candidate'] = { predict: c => Boolean(tiers.get(c.caseId)) };
  }
  if (JUDGES.includes('legacy')) {
    predictors['legacy-is_important'] = { predict: c => (c.legacy.isImportant === null ? null : Number(c.legacy.isImportant) === 1) };
    predictors['legacy-alpha_score'] = { score: c => (c.legacy.alphaScore === null ? null : Number(c.legacy.alphaScore)) };
  }
  if (JUDGES.includes('llm')) {
    const r = await llmScores();
    report.llm = { model: r.model, usage: r.usage, failed: r.failed };
    log(`llm：${r.model}，调用 ${r.usage.calls} 次（缓存 ${r.usage.cached}），tokens 入 ${r.usage.promptTokens} 出 ${r.usage.completionTokens}，失败 ${r.failed} 条\n`);
    predictors['llm'] = { score: c => { const v = r.out.get(c.caseId); return v ? Math.floor(v.reduce((a, b) => a + b, 0) / v.length) : null; }, values: r.out };
    // 两次打分的一致性：同一模型同一提示词，差多少
    const diffs = [...r.out.values()].map(v => Math.abs(v[0] - v[1]));
    if (diffs.length) log(`llm 两次打分之差：均值 ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1)}，为 0 的占 ${pct(diffs.filter(d => d === 0).length / diffs.length)}，≥10 的占 ${pct(diffs.filter(d => d >= 10).length / diffs.length)}\n`);
    // 组合：规则判为 A（香港监管与重点竞品，口径是全收）的直接入选，其余按模型分数过门槛
    if (JUDGES.includes('rules')) {
      const tiers = new Map(scored.map(c => [c.caseId, classify(asNews(c)).tier]));
      predictors['rules-A+llm'] = { score: c => (tiers.get(c.caseId) === 'A' ? 100 : predictors.llm.score(c)) };
    }
  }

  for (const [name, j] of Object.entries(predictors)) {
    log(`## ${name}`);
    const out = { };
    if (j.predict) {
      for (const split of ['development', 'holdout']) {
        out[split] = metrics(bySplit(split), j.predict);
        log(line(split === 'development' ? '开发集' : '留出集', out[split], weeks[split]));
      }
      out.strata = { development: strata(bySplit('development'), j.predict), holdout: strata(bySplit('holdout'), j.predict) };
      out.mistakes = mistakes(j.predict);
    } else {
      // 门槛扫描：开发集上选加权 F1 最高的门槛，再原样用在留出集
      const at = t => c => { const s = j.score(c); return s === null ? null : s >= t; };
      const sweep = SWEEP.map(t => ({ t, dev: metrics(bySplit('development'), at(t)), hold: metrics(bySplit('holdout'), at(t)) }));
      const best = sweep.reduce((a, b) => ((b.dev.wF1 ?? -1) > (a.dev.wF1 ?? -1) ? b : a));
      out.sweep = sweep.map(s => ({ t: s.t, dev: pick(s.dev), holdout: pick(s.hold) }));
      out.threshold = best.t;
      log(`门槛（开发集加权 F1 最高）= ${best.t}`);
      log(line('开发集', best.dev, weeks.development));
      log(line('留出集', best.hold, weeks.holdout));
      log('\n门槛扫描（开发集）：');
      for (const s of sweep.filter((_, i) => i % 2 === 0)) log(`  ${String(s.t).padStart(3)}  查全 ${pct(s.dev.recall)}  查准(加权) ${pct(s.dev.wPrecision)}  F1(加权) ${pct(s.dev.wF1)}  ≈${((s.dev.wtp + s.dev.wfp) / weeks.development).toFixed(1)} 条/周`);
      out.strata = { development: strata(bySplit('development'), at(best.t)), holdout: strata(bySplit('holdout'), at(best.t)) };
      out.mistakes = mistakes(at(best.t), j.score);
    }
    log('\n分层（入选比例）：');
    for (const split of ['development', 'holdout']) {
      log(`  ${split === 'development' ? '开发集' : '留出集'}：` + Object.entries(out.strata[split]).sort().map(([k, v]) => `${k} ${v.selected}/${v.n}`).join(' · '));
    }
    log('');
    report.judges[name] = out;
  }

  function mistakes(predict, score) {
    const list = [];
    for (const c of scored) {
      const p = predict(c);
      if (p === null) continue;
      const g = c.gold.decision === 'select';
      if (p === g) continue;
      list.push({
        kind: g ? 'FN' : 'FP', split: c.samplingContext.benchmarkSplit, stratum: c.samplingContext.samplingStratum, newsId: c.newsId,
        source: c.material.sourceName, date: c.material.publishedAt.slice(0, 10), title: c.material.title,
        weeklyHeadline: c.gold.weeklyHeadline || null, score: score ? score(c) : null,
      });
    }
    return list;
  }
  function pick(m) { return { recall: m.recall, wPrecision: m.wPrecision, wF1: m.wF1, tp: m.tp, fp: m.fp, fn: m.fn, wfp: Number(m.wfp.toFixed(1)) }; }

  // 判错条目（只列开发集，留出集的错例不看，免得拿它调）
  md.push('\n## 判错条目（开发集）');
  for (const [name, out] of Object.entries(report.judges)) {
    const dev = out.mistakes.filter(m => m.split === 'development');
    md.push(`\n### ${name}：漏选 ${dev.filter(m => m.kind === 'FN').length}、误选 ${dev.filter(m => m.kind === 'FP').length}`);
    for (const m of dev.sort((a, b) => a.kind.localeCompare(b.kind) || (b.score ?? 0) - (a.score ?? 0))) {
      md.push(`- ${m.kind} ${m.score ?? ''} [${m.stratum}] ${m.date} ${m.source}：${m.title.slice(0, 90)}${m.weeklyHeadline ? `  ⇐ 周报：${m.weeklyHeadline.slice(0, 50)}` : ''}`);
    }
  }

  const outDir = path.join(DIR, 'eval');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.at.replace(/[:.]/g, '-').slice(0, 19);
  const base = path.join(outDir, `${stamp}${LABEL ? '-' + LABEL.replace(/[^\w一-鿿-]+/g, '_') : ''}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 1));
  fs.writeFileSync(`${base}.md`, md.join('\n'));
  console.log(`\n完整报告：${base}.md`);
})().catch(e => { console.error(e); process.exit(1); });
