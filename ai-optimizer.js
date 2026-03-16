'use strict';

/**
 * ai-optimizer.js — AI 成本优化器
 *
 * 职责：
 *   1. 分级处理：规则引擎初筛 → 低价值跳过 AI → 中高价值送 AI
 *   2. 批量调用：攒一批（如 10 条）一次性送给 AI，降低 API 调用次数
 *   3. 成本预算控制：接近预算时自动降级到规则引擎
 *   4. 语义去重：避免相似内容重复调用 AI
 */

const { ruleEngine, callAI, batchClassify, aiCostTracker } = require('./ai');
const { contentFingerprint, normalizeKey } = require('./db');
const { jaccardSimilarity } = require('./filter');
const { AI_COST, AI_SOURCES } = require('./config');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const OPTIMIZER_CONFIG = {
  // 分级处理阈值
  SKIP_AI_SCORE_THRESHOLD: 30,     // alpha_score < 30 的直接跳过 AI
  BATCH_SIZE: 10,                  // 批量 AI 调用大小
  BATCH_DELAY_MS: 2000,            // 批次间隔 (ms)

  // 语义去重
  SEMANTIC_SIMILARITY_THRESHOLD: 0.75, // 相似度超过此值视为重复

  // 成本预算
  BUDGET_SOFT_LIMIT: 0.8,          // 达到 80% 预算时开始降级
  BUDGET_HARD_LIMIT: 1.0,          // 达到 100% 预算时完全停止 AI
};

// ── 规则预筛（在 AI 之前快速过滤低价值内容）───────────────────────────────────

/**
 * 基于规则判断条目是否可跳过 AI 分类
 * @param {Object} item - 新闻条目
 * @returns {Object} { skipAI: boolean, preScore: number, category: string }
 */
function preFilterForAI(item) {
  const title = (item.title || '').toLowerCase();
  const source = item.source || '';

  // 1. 常规上币/交易对公告 — 低价值，跳过 AI
  if (/(?:listing|will list|上线 | 上架 |new pair|新增交易对 | 下架 |delisting)/i.test(title)) {
    // HK 合规所的上币公告仍需 AI 分析
    if (!source.includes('HashKey') && !source.includes('OSL') && !source.includes('Exio')) {
      return {
        skipAI: true,
        preScore: 25,
        category: '交易/量化',
        reason: 'routine_listing',
      };
    }
  }

  // 2. 资金费率/永续合约类 — 纯量化数据
  if (/(?:资金费率 | 永续合约资金|funding rate)/i.test(title)) {
    return {
      skipAI: true,
      preScore: 15,
      category: '交易/量化',
      reason: 'funding_rate',
    };
  }

  // 3. 爆仓/清算/鲸鱼类 — 市场噪声
  if (/(?:爆仓 | 清算 | 鲸鱼 |whale|liquidat)/i.test(title)) {
    return {
      skipAI: true,
      preScore: 20,
      category: '交易/量化',
      reason: 'market_noise',
    };
  }

  // 4. Meme/空投/Launchpool 类 — 营销噪声
  if (/(?:meme|空投 |airdrop|launchpool|launchpad)/i.test(title)) {
    return {
      skipAI: true,
      preScore: 20,
      category: '拉新/社媒/社群/pr',
      reason: 'marketing_noise',
    };
  }

  // 5. 极短标题（< 10 字且非 HK 源）— 可能是碎片或无意义的 hashtag
  if (item.title && item.title.length < 10 && !['SFC', 'OSL', 'HashKey', 'Exio'].includes(source)) {
    return {
      skipAI: true,
      preScore: 15,
      category: '其他',
      reason: 'too_short',
    };
  }

  // 6. 高价值关键词触发（必须送 AI）
  const highValueKeywords = [
    '牌照', '监管', 'SFC', 'V ASP', '合规', '处罚', '调查', 'CEO', '收购',
    'RWA', '稳定币', '新规', '法案', '立法', '制裁', '黑客', '被盗',
  ];
  if (highValueKeywords.some(kw => title.includes(kw))) {
    return {
      skipAI: false,
      preScore: 70, // 预设为较高分数，让 AI 最终判定
      category: null,
      reason: 'high_value_keyword',
    };
  }

  // 默认：需要 AI 处理
  return {
    skipAI: false,
    preScore: null,
    category: null,
    reason: 'needs_ai',
  };
}

// ── 语义去重（避免相似内容重复调用 AI）──────────────────────────────────────

/**
 * 对需要 AI 处理的条目进行语义去重
 * @param {Array} items - 待处理条目
 * @param {Map} processedCache - 已处理缓存（title_hash -> result）
 * @returns {Object} { uniqueItems: Array, duplicates: Array }
 */
function semanticDedupForAI(items, processedCache = new Map()) {
  const uniqueItems = [];
  const duplicates = [];

  for (const item of items) {
    const titleKey = normalizeKey(item.title, '').split('|')[0];

    // 检查精确匹配缓存
    if (processedCache.has(titleKey)) {
      duplicates.push({
        ...item,
        _duplicateOf: titleKey,
        _cachedResult: processedCache.get(titleKey),
      });
      continue;
    }

    // 检查语义相似
    let isDuplicate = false;
    for (const cachedKey of processedCache.keys()) {
      const sim = jaccardSimilarity(titleKey, cachedKey);
      if (sim > OPTIMIZER_CONFIG.SEMANTIC_SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        duplicates.push({
          ...item,
          _duplicateOf: cachedKey,
          _similarity: sim,
          _cachedResult: processedCache.get(cachedKey),
        });
        break;
      }
    }

    if (!isDuplicate) {
      uniqueItems.push(item);
    }
  }

  return { uniqueItems, duplicates };
}

// ── 智能批量处理 ────────────────────────────────────────────────────────────

/**
 * 智能批量处理新闻条目（分级 + 批量 + 去重）
 * @param {Array} items - 待处理条目列表
 * @param {Object} options - 选项
 * @returns {Promise<Array>} 处理后的条目
 */
async function processBatchSmart(items, options = {}) {
  const {
    useSemanticDedup = true,
    respectBudget = true,
    recentInsights = [],
  } = options;

  console.log(`[AI Optimizer] Processing ${items.length} items...`);

  const results = [];
  const aiQueue = [];
  const processedCache = new Map(); // 用于语义去重
  let aiCallCount = 0;

  // Step 1: 规则预筛
  for (const item of items) {
    const preFilter = preFilterForAI(item);

    if (preFilter.skipAI) {
      // 直接应用预筛结果
      results.push({
        ...item,
        business_category: preFilter.category,
        competitor_category: '其他',
        detail: item.title.slice(0, 80),
        alpha_score: preFilter.preScore,
        is_important: preFilter.preScore >= 85 ? 1 : 0,
        impact: '中性',
        bitv_action: '无需特别行动',
        _ai_source: 'rule_engine_prefilter',
        _skip_reason: preFilter.reason,
      });
      console.log(`  [SKIP] ${item.source}: ${item.title.slice(0, 40)} (${preFilter.reason})`);
    } else {
      aiQueue.push(item);
    }
  }

  console.log(`[AI Optimizer] After pre-filter: ${items.length} → ${aiQueue.length} items need AI`);

  // Step 2: 语义去重（可选）
  let dedupedItems = aiQueue;
  let duplicateCount = 0;

  if (useSemanticDedup && aiQueue.length > 1) {
    const { uniqueItems, duplicates } = semanticDedupForAI(aiQueue, processedCache);
    dedupedItems = uniqueItems;
    duplicateCount = duplicates.length;

    // 应用缓存结果到重复项
    for (const dup of duplicates) {
      results.push({
        ...dup,
        ...dup._cachedResult,
        _duplicate_of: dup._duplicateOf,
        _similarity: dup._similarity,
      });
    }

    console.log(`[AI Optimizer] After semantic dedup: ${aiQueue.length} → ${dedupedItems.length} (removed ${duplicateCount} duplicates)`);
  }

  // Step 3: 检查 AI 预算状态
  const budgetStatus = aiCostTracker?.getStatus?.() || { isOverBudget: false, budgetUsedPercent: 0 };

  if (respectBudget && budgetStatus.isOverBudget) {
    console.warn('[AI Optimizer] AI budget exceeded, using rule engine for all remaining items');
    for (const item of dedupedItems) {
      const result = ruleEngine.process(item.title, item.content, item.source);
      result._ai_source = 'rule_engine_budget_exceeded';
      results.push({ ...item, ...result });
    }
    return results;
  }

  // Step 4: 批量 AI 处理
  const shouldUseSoftLimit = respectBudget && parseFloat(budgetStatus.budgetUsedPercent) >= OPTIMIZER_CONFIG.BUDGET_SOFT_LIMIT * 100;

  if (shouldUseSoftLimit) {
    console.warn(`[AI Optimizer] Budget used ${budgetStatus.budgetUsedPercent}%, applying soft limit`);
  }

  for (let i = 0; i < dedupedItems.length; i += OPTIMIZER_CONFIG.BATCH_SIZE) {
    const batch = dedupedItems.slice(i, i + OPTIMIZER_CONFIG.BATCH_SIZE);

    // 如果接近预算软限制，部分使用规则引擎
    if (shouldUseSoftLimit && Math.random() < 0.5) {
      console.log(`[AI Optimizer] Batch ${Math.floor(i / OPTIMIZER_CONFIG.BATCH_SIZE) + 1}: Using rule engine (budget saving)`);
      for (const item of batch) {
        const result = ruleEngine.process(item.title, item.content, item.source);
        result._ai_source = 'rule_engine_budget_saving';
        results.push({ ...item, ...result });
      }
    } else {
      console.log(`[AI Optimizer] Batch ${Math.floor(i / OPTIMIZER_CONFIG.BATCH_SIZE) + 1}: Calling AI (${batch.length} items)`);

      try {
        // 使用增强版 AI 的批量处理
        const batchResults = await batchClassify(batch);

        for (let j = 0; j < batch.length; j++) {
          const result = batchResults.get(j);
          if (result) {
            // 补充完整字段
            const enriched = {
              ...result,
              impact: result.impact || '中性',
              bitv_action: result.bitv_action || '关注后续发展',
              trend_reference: result.trend_reference || '',
            };
            results.push({ ...batch[j], ...enriched });
            // 加入缓存
            const titleKey = normalizeKey(batch[j].title, '').split('|')[0];
            processedCache.set(titleKey, enriched);
          } else {
            // 降级到规则引擎
            const ruleResult = ruleEngine.process(batch[j].title, batch[j].content, batch[j].source);
            results.push({ ...batch[j], ...ruleResult });
          }
        }

        aiCallCount++;

        // 批次间隔
        if (i + OPTIMIZER_CONFIG.BATCH_SIZE < dedupedItems.length) {
          await new Promise(r => setTimeout(r, OPTIMIZER_CONFIG.BATCH_DELAY_MS));
        }
      } catch (err) {
        console.error('[AI Optimizer] Batch processing error:', err.message);
        // 全部降级到规则引擎
        for (const item of batch) {
          const ruleResult = ruleEngine.process(item.title, item.content, item.source);
          results.push({ ...item, ...ruleResult });
        }
      }
    }
  }

  console.log(`[AI Optimizer] Done. Total AI calls: ${aiCallCount}, Results: ${results.length}`);

  return results;
}

// ── 导出 ─────────────────────────────────────────────────────────────────────

module.exports = {
  // 核心函数
  processBatchSmart,
  preFilterForAI,
  semanticDedupForAI,

  // 配置
  OPTIMIZER_CONFIG,

  // 成本追踪（从 ai.js 重新导出）
  aiCostTracker: aiCostTracker || {
    dailyTokens: 0,
    dailyCostUSD: 0,
    getStatus: () => ({ dailyCostUSD: '0', budgetUsedPercent: '0' }),
  },
};
