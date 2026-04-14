'use strict';
/**
 * macro-market.js — 宏观市场背景数据模块
 *
 * 使用免费公开 API，无需 API Key：
 * - CoinGecko /api/v3/global       — 总市值、BTC 主导率、24h 涨跌
 * - CoinGecko /simple/price        — BTC / ETH 实时价格
 * - Alternative.me Fear & Greed    — 市场恐惧贪婪指数
 */

const axios = require('axios');

const TIMEOUT = 8000;

// ── 数据获取 ──────────────────────────────────────────────────────────────────

async function fetchGlobalMarket() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: TIMEOUT });
    const d = data?.data || {};
    return {
      totalMarketCapUsd:    d.total_market_cap?.usd || 0,
      btcDominance:         d.market_cap_percentage?.btc || 0,
      marketCapChange24h:   d.market_cap_change_percentage_24h_usd || 0,
    };
  } catch (e) {
    console.warn('[Macro] CoinGecko global failed:', e.message);
    return null;
  }
}

async function fetchCryptoPrices() {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { timeout: TIMEOUT },
    );
    return {
      btcPrice:    data?.bitcoin?.usd || 0,
      btcChange:   data?.bitcoin?.usd_24h_change || 0,
      ethPrice:    data?.ethereum?.usd || 0,
      ethChange:   data?.ethereum?.usd_24h_change || 0,
    };
  } catch (e) {
    console.warn('[Macro] CoinGecko price failed:', e.message);
    return null;
  }
}

async function fetchFearGreed() {
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: TIMEOUT });
    const item = data?.data?.[0];
    if (!item) return null;
    return {
      value:          parseInt(item.value, 10),
      classification: item.value_classification,
    };
  } catch (e) {
    console.warn('[Macro] Fear & Greed failed:', e.message);
    return null;
  }
}

// ── 格式化工具 ────────────────────────────────────────────────────────────────

function formatCap(usd) {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9)  return `$${(usd / 1e9).toFixed(1)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
}

function formatPct(pct) {
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function fngLabel(value) {
  if (value >= 75) return `极度贪婪 🔥 (${value})`;
  if (value >= 55) return `贪婪 😊 (${value})`;
  if (value >= 45) return `中性 😐 (${value})`;
  if (value >= 25) return `恐慌 😰 (${value})`;
  return `极度恐慌 😱 (${value})`;
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * 并行拉取宏观数据，返回 Markdown 段落。
 * 任一数据源失败时降级省略该行，全部失败则返回 null。
 * @returns {Promise<string|null>}
 */
async function fetchMacroPanel() {
  console.log('[Macro] Fetching macro market data...');

  const [global, prices, fng] = await Promise.all([
    fetchGlobalMarket(),
    fetchCryptoPrices(),
    fetchFearGreed(),
  ]);

  const lines = [];

  if (prices && prices.btcPrice > 0) {
    const btc = `BTC **$${prices.btcPrice.toLocaleString()}** ${formatPct(prices.btcChange)}`;
    const eth = `ETH **$${prices.ethPrice.toLocaleString()}** ${formatPct(prices.ethChange)}`;
    lines.push(`${btc}　｜　${eth}`);
  }

  if (global && global.totalMarketCapUsd > 0) {
    const cap = `总市值 **${formatCap(global.totalMarketCapUsd)}** ${formatPct(global.marketCapChange24h)}`;
    const dom = `BTC主导率 **${global.btcDominance.toFixed(1)}%**`;
    lines.push(`${cap}　｜　${dom}`);
  }

  if (fng) {
    lines.push(`市场情绪 ${fngLabel(fng.value)}`);
  }

  if (lines.length === 0) {
    console.warn('[Macro] All data sources failed, skipping panel.');
    return null;
  }

  return `🌐 **宏观市场背景**\n${lines.map(l => `> ${l}`).join('\n')}`;
}

/**
 * 返回纯文本形式的宏观摘要，用于注入 AI prompt 提供上下文。
 * @returns {Promise<string>}
 */
async function fetchMacroContext() {
  const [prices, fng] = await Promise.all([
    fetchCryptoPrices(),
    fetchFearGreed(),
  ]);

  const parts = [];
  if (prices && prices.btcPrice > 0) {
    parts.push(`BTC $${prices.btcPrice.toLocaleString()} (24h ${formatPct(prices.btcChange)})`);
  }
  if (fng) {
    parts.push(`市场情绪: ${fng.classification} (${fng.value}/100)`);
  }
  return parts.join('，');
}

module.exports = { fetchMacroPanel, fetchMacroContext };
