'use strict';
/**
 * ai-interest-filter.js — AI 智能兴趣筛选
 *
 * 功能：
 * 1. 读取用户兴趣描述（自然语言）
 * 2. 对每条新闻进行相关性打分 (0-100)
 * 3. 只推送超过阈值的新闻
 *
 * 使用场景：
 * - 替代纯关键词过滤
 * - 让用户用自然语言描述兴趣："我关注交易所安全、BTC 监管、DeFi 协议"
 * - AI 对每条新闻打分，只推送真正相关的
 */

const { callAI, ruleEngine } = require('./ai-provider');
const { db } = require('./db');
const path = require('path');
const fs = require('fs');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const INTEREST_FILE = path.join(__dirname, 'ai_interests.txt');
const DEFAULT_INTERESTS = `
我关注以下领域：
1. 香港 SFC 监管政策变化
2. 交易所安全事件（黑客攻击、资金损失）
3. BTC/ETH 监管动态
4. DeFi 协议合规化进展
5. 稳定币发行与监管
6. RWA（现实世界资产）代币化

不关注：
- 常规市场价格波动
- KOL 个人观点
- 未经验证的传闻
`.trim();

// 缓存用户兴趣
let cachedInterests = null;
let lastLoadTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 加载用户兴趣
 */
function loadUserInterests() {
  // 检查缓存
  if (cachedInterests && Date.now() - lastLoadTime < CACHE_TTL) {
    return cachedInterests;
  }

  try {
    if (fs.existsSync(INTEREST_FILE)) {
      const content = fs.readFileSync(INTEREST_FILE, 'utf-8').trim();
      cachedInterests = content || DEFAULT_INTERESTS;
    } else {
      cachedInterests = DEFAULT_INTERESTS;
    }
    lastLoadTime = Date.now();
    return cachedInterests;
  } catch (err) {
    console.error('[InterestFilter] Error loading interests:', err.message);
    return DEFAULT_INTERESTS;
  }
}

/**
 * 保存用户兴趣
 */
function saveUserInterests(interests) {
  try {
    fs.writeFileSync(INTEREST_FILE, interests, 'utf-8');
    cachedInterests = interests;
    lastLoadTime = Date.now();
    return true;
  } catch (err) {
    console.error('[InterestFilter] Error saving interests:', err.message);
    return false;
  }
}

/**
 * AI 对单条新闻进行兴趣相关性打分
 * @param {Object} item - 新闻条目
 * @param {string} userInterests - 用户兴趣描述
 * @returns {Promise<number>} - 相关性分数 (0-100)
 */
async function scoreByInterest(item, userInterests) {
  const prompt = `你是一个智能新闻筛选助手。请根据用户的兴趣描述，对以下新闻进行相关性打分 (0-100)。

【用户兴趣】
${userInterests}

【新闻内容】
标题：${item.title}
来源：${item.source}
分类：${item.business_category || '未分类'}
摘要：${item.detail || item.content || '(无)'}

请只输出一个 0-100 的整数分数：
- 90-100: 完全匹配用户兴趣，必须推送
- 70-89:  高度相关，建议推送
- 50-69:  中等相关，可选择推送
- 30-49:  低相关，不建议推送
- 0-29:   无关，忽略`;

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { 
      json: false, 
      temperature: 0.1 
    });

    if (text) {
      // 提取数字
      const match = text.match(/(\d+)/);
      if (match) {
        let score = parseInt(match[1]);
        return Math.max(0, Math.min(100, score));
      }
    }
  } catch (err) {
    console.warn('[InterestFilter] AI scoring error:', err.message);
  }

  // 降级：基于规则的简单匹配
  return ruleBasedScore(item, userInterests);
}

/**
 * 规则引擎打分（降级方案）
 */
function ruleBasedScore(item, userInterests) {
  const text = `${item.title} ${item.content || ''} ${item.business_category || ''}`.toLowerCase();
  const interests = userInterests.toLowerCase();

  // 提取兴趣关键词（简化版）
  const keywords = [
    '监管', '合规', 'sfc', '证监会', '牌照',
    '安全', '黑客', '攻击', '漏洞', '被盗',
    'btc', '比特币', 'eth', '以太坊',
    'defi', '去中心化',
    '稳定币', 'usdt', 'usdc',
    'rwa', '代币化', '现实世界资产'
  ];

  let score = 50; // 基础分

  for (const kw of keywords) {
    if (interests.includes(kw) && text.includes(kw)) {
      score += 10;
    }
  }

  // 负面关键词降权
  const negativeKeywords = ['价格', '行情', '暴涨', '暴跌', 'k 线', '技术分析'];
  for (const kw of negativeKeywords) {
    if (text.includes(kw)) {
      score -= 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 批量对新闻列表进行兴趣打分
 * @param {Array} items - 新闻列表
 * @param {number} threshold - 推送阈值 (默认 60)
 * @returns {Promise<Array>} - 过滤后的新闻列表（带 interest_score）
 */
async function filterByInterest(items, threshold = 60) {
  const userInterests = loadUserInterests();
  const results = [];

  console.log(`[InterestFilter] Filtering ${items.length} items with threshold ${threshold}`);

  for (const item of items) {
    try {
      const score = await scoreByInterest(item, userInterests);
      item.interest_score = score;

      if (score >= threshold) {
        results.push(item);
        console.log(`  [KEEP] Score ${score}: ${item.title.substring(0, 50)}`);
      } else {
        console.log(`  [SKIP] Score ${score}: ${item.title.substring(0, 50)}`);
      }
    } catch (err) {
      console.error('[InterestFilter] Error scoring item:', err.message);
      // 保留原始 alpha_score 作为备选
      item.interest_score = item.alpha_score || 50;
      if (item.interest_score >= threshold) {
        results.push(item);
      }
    }
  }

  console.log(`[InterestFilter] Filtered: ${items.length} → ${results.length} (threshold=${threshold})`);
  return results;
}

/**
 * 批量打分（使用 AI 批量处理以节省成本）
 */
async function batchScoreByInterest(items, userInterests) {
  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    const prompt = `你是一个智能新闻筛选助手。请根据用户兴趣，对以下 ${chunk.length} 条新闻逐一打分 (0-100)。

【用户兴趣】
${userInterests}

【新闻列表】
${chunk.map((item, idx) => `${idx + 1}. [${item.source}] ${item.title}`).join('\n')}

请输出 JSON 数组（不含 Markdown），格式：
[{"idx": 1, "score": 85}, {"idx": 2, "score": 45}, ...]

评分标准：
- 90-100: 完全匹配用户兴趣，必须推送
- 70-89:  高度相关，建议推送
- 50-69:  中等相关，可选择推送
- 30-49:  低相关，不建议推送
- 0-29:   无关，忽略`;

    try {
      const text = await callAI([{ role: 'user', content: prompt }], { 
        json: true, 
        temperature: 0.1 
      });

      if (text) {
        const scores = JSON.parse(text);
        if (Array.isArray(scores)) {
          for (const s of scores) {
            const idx = (s.idx || 1) - 1;
            if (idx >= 0 && idx < chunk.length) {
              chunk[idx].interest_score = Math.max(0, Math.min(100, s.score || 50));
            }
          }
        }
      }
    } catch (err) {
      console.warn('[InterestFilter] Batch scoring error, falling back to individual');
      // 降级为逐条打分
      for (const item of chunk) {
        item.interest_score = await scoreByInterest(item, userInterests);
      }
    }

    results.push(...chunk);
    
    // 避免 API 限流
    if (i + BATCH_SIZE < items.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

/**
 * 获取当前兴趣筛选状态
 */
function getStatus() {
  const interests = loadUserInterests();
  const hasCustomInterests = fs.existsSync(INTEREST_FILE);
  
  return {
    hasCustomInterests,
    interestsPreview: interests.split('\n').slice(0, 5).join('\n'),
    interestFile: INTEREST_FILE,
  };
}

/**
 * 更新推送阈值并持久化
 */
function updateThreshold(newThreshold) {
  const configKey = 'interest_filter_threshold';
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO config (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);
    stmt.run(configKey, String(newThreshold));
    return true;
  } catch (err) {
    console.error('[InterestFilter] Error updating threshold:', err.message);
    return false;
  }
}

/**
 * 获取推送阈值
 */
function getThreshold() {
  const configKey = 'interest_filter_threshold';
  try {
    const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
    const row = stmt.get(configKey);
    return row ? parseInt(row.value) : 60; // 默认 60
  } catch (err) {
    return 60;
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────────────
module.exports = {
  loadUserInterests,
  saveUserInterests,
  scoreByInterest,
  filterByInterest,
  batchScoreByInterest,
  getStatus,
  getThreshold,
  updateThreshold,
  INTEREST_FILE,
  DEFAULT_INTERESTS,
};
