'use strict';
/**
 * ai-provider.js — AI 服务多提供商管理模块
 *
 * 实现三级降级策略：
 * L1: DeepSeek V3（主要）
 * L2: 备用提供商（OpenRouter/Anthropic）
 * L3: 本地规则引擎（完全降级）
 */

const axios = require('axios');
const { BUSINESS_CATEGORIES, COMPETITOR_CATEGORIES } = require('./config');
require('dotenv').config();

// ── 提供商配置 ───────────────────────────────────────────────────────────────
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    key: process.env.DEEPSEEK_API_KEY,
    priority: 1,
    enabled: !!process.env.DEEPSEEK_API_KEY,
    supportsJson: true,
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    key: process.env.OPENROUTER_API_KEY,
    priority: 2,
    enabled: !!process.env.OPENROUTER_API_KEY,
    supportsJson: true,
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    key: process.env.OPENAI_API_KEY,
    priority: 3,
    enabled: !!process.env.OPENAI_API_KEY,
    supportsJson: true,
  },
  anthropic: {
    name: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    key: process.env.ANTHROPIC_API_KEY,
    priority: 4,
    enabled: !!process.env.ANTHROPIC_API_KEY,
    supportsJson: false,
    authHeader: { 'anthropic-version': '2023-06-01' },
  },
  google: {
    name: 'Google Gemini',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`,
    key: process.env.GEMINI_API_KEY,
    priority: 5,
    enabled: !!process.env.GEMINI_API_KEY,
    supportsJson: true,
    isGoogle: true,
  },
};

// 当前活跃的提供商
let currentProvider = 'deepseek';
let fallbackCount = 0;
const MAX_FALLBACK = 3; // 连续降级3次后进入规则引擎

// ── 规则引擎（L3 降级）───────────────────────────────────────────────────────
const RULE_ENGINE = {
  // 基于关键词的业务分类
  classifyByKeywords(title, content = '') {
    const text = (title + ' ' + content).toLowerCase();

    const rules = [
      { cat: '合规', keywords: ['牌照', '合规', '监管', 'sfc', 'vasp', '许可', 'license', 'regulated'] },
      { cat: '监管', keywords: ['监管', '处罚', '调查', '违规', 'penalty', 'violation', 'sec', 'cftc'] },
      { cat: '政策', keywords: ['政策', '法规', '立法', '法案', 'policy', 'regulation', 'law', 'bill'] },
      { cat: 'RWA', keywords: ['rwa', 'real world asset', '代币化', 'tokenization', '实物资产'] },
      { cat: '稳定币/平台币', keywords: ['稳定币', 'stablecoin', 'usdt', 'usdc', '平台币', 'launchpad'] },
      { cat: '交易/量化', keywords: ['交易', '量化', 'trading', 'market making', '流动性'] },
      { cat: '钱包/支付', keywords: ['钱包', '支付', 'wallet', 'payment', 'custody'] },
      { cat: 'toB/机构', keywords: ['机构', 'b2b', 'enterprise', 'institutional', 'api'] },
      { cat: '投融资', keywords: ['融资', '投资', 'funding', 'investment', 'series', '估值'] },
    ];

    for (const rule of rules) {
      if (rule.keywords.some(k => text.includes(k))) {
        return rule.cat;
      }
    }
    return '其他';
  },

  // 竞品分类
  classifyCompetitor(title, content = '', source = '') {
    const text = (title + ' ' + content + ' ' + source).toLowerCase();

    const hkExchanges = ['hashkey', 'osl', 'exio', 'matrixport', 'panther', 'hkbu'];
    const offshoreExchanges = ['binance', 'okx', 'bybit', 'gate', 'mexc', 'bitget', 'htx', 'kucoin'];

    if (hkExchanges.some(k => text.includes(k))) return '香港合规所';
    if (offshoreExchanges.some(k => text.includes(k))) return '离岸所';
    if (text.includes('sfc') || text.includes('监管') || text.includes('政策')) return '政策';

    return '其他';
  },

  // 重要性判定
  calculateImportance(title, content = '', source = '') {
    const text = (title + ' ' + content).toLowerCase();
    let score = 50; // 基础分

    // 高权重关键词
    const highKeywords = ['牌照', '监管', 'sfc', '处罚', 'ceo', '收购', 'merger', 'hack', '被盗'];
    const mediumKeywords = ['融资', 'launch', 'partnership', 'expansion', 'new market'];

    highKeywords.forEach(k => { if (text.includes(k)) score += 20; });
    mediumKeywords.forEach(k => { if (text.includes(k)) score += 10; });

    // 来源加权
    const highPrioritySources = ['SFC', 'OSL', 'HashKey', 'Binance', 'OKX'];
    if (highPrioritySources.some(s => source.includes(s))) score += 15;

    return Math.min(100, score);
  },

  // 生成摘要
  generateSummary(title, content = '') {
    // 如果内容存在且比标题长，提取前80字
    if (content && content.length > title.length) {
      return content.slice(0, 80).replace(/\s+/g, ' ') + (content.length > 80 ? '...' : '');
    }
    return title.slice(0, 80);
  },

  // 完整处理
  process(title, content = '', source = '') {
    const business_category = this.classifyByKeywords(title, content);
    const competitor_category = this.classifyCompetitor(title, content, source);
    const alpha_score = this.calculateImportance(title, content, source);
    const detail = this.generateSummary(title, content);

    return {
      business_category,
      competitor_category,
      detail,
      alpha_score,
      is_important: alpha_score >= 85 ? 1 : 0,
      impact: '中性',
      bitv_action: '关注后续发展',
      _source: 'rule_engine', // 标记来源
    };
  },
};

// ── 统一调用接口 ─────────────────────────────────────────────────────────────
async function callAI(messages, { temperature = 0.1, max_tokens = 2000, json = false } = {}) {
  const providers = Object.entries(PROVIDERS)
    .filter(([_, p]) => p.enabled)
    .sort((a, b) => a[1].priority - b[1].priority);

  if (providers.length === 0) {
    console.warn('[AI] No AI providers configured, using rule engine');
    return null;
  }

  // 尝试所有可用提供商
  for (const [name, provider] of providers) {
    try {
      const payload = {
        model: provider.model,
        messages,
        temperature,
        max_tokens,
      };
      if (json) payload.response_format = { type: 'json_object' };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.key}`,
      };

      // OpenRouter 需要额外 header
      if (name === 'openrouter') {
        headers['HTTP-Referer'] = process.env.APP_URL || 'https://alpha-radar.vercel.app';
        headers['X-Title'] = 'Alpha Radar';
      }

      // Anthropic 需要不同的 API 格式
      if (name === 'anthropic') {
        const anthropicPayload = {
          model: provider.model,
          messages,
          max_tokens,
          temperature,
          ...(json ? { system: 'You are a helpful assistant that responds in JSON format.' } : {}),
        };
        const res = await axios.post(provider.url, anthropicPayload, {
          headers: {
            ...headers,
            ...provider.authHeader,
            'x-api-key': provider.key,
          },
          timeout: 45000,
        });
        const content = res.data?.content?.[0]?.text?.trim();
        if (content) {
          if (currentProvider !== name) {
            console.log(`[AI] Switched to ${provider.name}`);
            currentProvider = name;
            fallbackCount = 0;
          }
          return content;
        }
        continue;
      }

      // Google Gemini 需要不同的 API 格式
      if (name === 'google') {
        const googlePayload = {
          contents: messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
          generationConfig: {
            temperature,
            maxOutputTokens: max_tokens,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        };
        const res = await axios.post(`${provider.url}?key=${provider.key}`, googlePayload, {
          headers,
          timeout: 45000,
        });
        const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (content) {
          if (currentProvider !== name) {
            console.log(`[AI] Switched to ${provider.name}`);
            currentProvider = name;
            fallbackCount = 0;
          }
          return content;
        }
        continue;
      }

      const res = await axios.post(provider.url, payload, {
        headers,
        timeout: 45000,
      });

      const content = res.data?.choices?.[0]?.message?.content?.trim();

      if (content) {
        if (currentProvider !== name) {
          console.log(`[AI] Recovered from ${currentProvider} to ${name}`);
          currentProvider = name;
          fallbackCount = 0;
        }
        return content;
      }
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.warn(`[AI] ${provider.name} failed (${status}): ${errorMsg}`);

      // 记录降级
      if (currentProvider === name) {
        fallbackCount++;
        if (fallbackCount >= MAX_FALLBACK) {
          console.warn('[AI] Max fallback reached, switching to next provider');
        }
      }

      // 继续尝试下一个提供商
      continue;
    }
  }

  // 所有提供商都失败
  console.error('[AI] All providers failed, returning null for rule engine fallback');
  return null;
}

// ── 带重试的调用 ─────────────────────────────────────────────────────────────
async function callWithRetry(messages, options = {}) {
  const maxRetries = options.maxRetries || 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await callAI(messages, options);
    if (result !== null) return result;

    if (attempt < maxRetries) {
      const wait = attempt * 2000;
      console.warn(`[AI] Retry ${attempt}/${maxRetries} after ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  return null;
}

// ── 导出 ─────────────────────────────────────────────────────────────────────
module.exports = {
  // 核心调用
  callAI: callWithRetry,

  // 规则引擎
  ruleEngine: RULE_ENGINE,

  // 获取当前状态
  getStatus() {
    return {
      currentProvider,
      fallbackCount,
      providers: Object.entries(PROVIDERS).map(([name, p]) => ({
        name: p.name,
        enabled: p.enabled,
        priority: p.priority,
        isActive: name === currentProvider,
      })),
    };
  },

  // 重置提供商
  resetProvider() {
    currentProvider = 'deepseek';
    fallbackCount = 0;
  },
};
