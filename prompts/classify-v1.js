'use strict';
/**
 * prompts/classify-v1.js — Versioned prompt templates for AI classification
 *
 * Benefits:
 * - Prompts are separated from business logic
 * - Easy to A/B test different prompt versions
 * - Version tracking in AI results (_prompt_version)
 */

const { BUSINESS_CATEGORIES, COMPETITOR_CATEGORIES } = require('../config');

const CAT_OPTIONS = BUSINESS_CATEGORIES.join(', ');
const COMP_OPTIONS = COMPETITOR_CATEGORIES.join(', ');

module.exports = {
  name: 'classify-v1',
  version: '1.0.0',

  /**
   * Single-item classification prompt
   */
  single(title, content = '', source = '') {
    return {
      system: `你是一个加密货币行业顶级战略分析师，专注于香港 Web3 监管与合规市场。
你的分析要简洁、精准、可执行。`,

      user: `请对以下快讯进行深度分析。

快讯内容：
标题: ${title}
内容: ${content || '(无)'}
来源: ${source}

请输出 JSON 对象（不含 Markdown），包含：
1. business_category: 从 [${CAT_OPTIONS}] 中选一个
2. competitor_category: 从 [${COMP_OPTIONS}] 中选一个
3. detail: 一句话精炼总结（≤80字）
4. alpha_score: 0-100 的情报价值评分：
   - 90-100: 极高。涉及 SFC 政策突发变更、重要牌照获批/撤回、核心高管变动、主流交易所重大合规处罚。
   - 70-89: 高。香港市场重要业务进展、RWA/稳定币新规落地、头部所战略调整。
   - 40-69: 中。普通业务上线、常规行业新闻。
   - <40: 低。常规市场波动、KOL 言论、重复性快讯。
5. impact: "利好", "利空", 或 "中性"（站在香港合规所 BitV 的立场）
6. bitv_action: 针对此情报，BitV 应该采取的 1 条具体动作建议

示例：{"business_category":"合规","competitor_category":"香港合规所","detail":"HashKey 获准向零售用户提供服务。","alpha_score":95,"impact":"利空","bitv_action":"立即调研其零售开户流程，评估对我司获客策略的冲击。"}`,

      parse(text) {
        try {
          const parsed = JSON.parse(text);
          parsed.is_important = parsed.alpha_score >= 85 ? 1 : 0;
          parsed._prompt_version = 'classify-v1';
          return parsed;
        } catch (e) {
          return null;
        }
      },
    };
  },

  /**
   * Batch classification prompt
   */
  batch(items, startIdx = 0) {
    const listStr = items.map((it, j) =>
      `${startIdx + j + 1}. 标题：${it.title} | 来源：${it.source}`,
    ).join('\n');

    return {
      system: '你是加密货币行业资深分析师。按要求输出 JSON 数组。',

      user: `请对以下 ${items.length} 条快讯逐条分类。

${listStr}

请输出 JSON 数组（不含 Markdown），每个元素包含：
- idx: 原序号（从 ${startIdx + 1} 开始）
- business_category: 从 [${CAT_OPTIONS}] 中选一个
- competitor_category: 从 [${COMP_OPTIONS}] 中选一个
- detail: ≤80字一句话摘要
- alpha_score: 0-100 情报价值评分
- is_important: 0或1

示例：[{"idx":1,"business_category":"合规","competitor_category":"离岸所","detail":"...","alpha_score":75,"is_important":1}]`,

      parse(text, totalItems) {
        try {
          const arr = JSON.parse(text);
          if (!Array.isArray(arr)) return new Map();
          const map = new Map();
          arr.forEach(r => {
            const origIdx = (r.idx || 0) - 1;
            if (origIdx >= 0 && origIdx < totalItems) {
              r._prompt_version = 'classify-v1';
              map.set(origIdx, r);
            }
          });
          return map;
        } catch (e) {
          return new Map();
        }
      },
    };
  },

  /**
   * Daily summary prompt
   */
  dailySummary(newsItems, topSources) {
    const digest = newsItems.map((item, i) =>
      `${i + 1}. [${item.business_category || item.source}] ${item.title}${item.detail ? ' — ' + item.detail : ''}`,
    ).join('\n');

    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

    return {
      system: '你是香港 Web3 行业专家，负责 BitV（BitValve，正在申请 SFC VATP 牌照）的研究规划。',

      user: `今日行业动态（共 ${newsItems.length} 条）：
${digest}

请撰写今日行业简报（极度易读）：

📅 **日期**: ${today}

📊 **总结论** (2-3句，概括今日整体态势)

🔍 **分板块动态**
• **合规/监管**: [关键动态]
• **交易所**: [头部交易所动作]
• **香港市场**: [牌照与业务进展]
• **投融资**: [重要融资事件]

💡 **对 BitV 的启示** (1-2条具体可执行建议)

📈 **今日数据**: 抓取 ${newsItems.length} 条 | 来源: ${topSources}

要求：大量加粗高亮核心信息；短段落+bullet；总字数 ≤400 字；不用 # 号标题。`,
    };
  },
};
