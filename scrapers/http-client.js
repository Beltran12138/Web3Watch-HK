'use strict';

/**
 * HTTP 客户端封装
 * 提供统一的 HTTP 请求接口，支持代理、重试、缓存等功能
 * 用于替代 Puppeteer 进行简单的 HTTP/HTTPS 抓取
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { SCRAPER } = require('../config');
const logger = require('../lib/logger');

// 请求缓存（内存）
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 创建 axios 实例
function createClient(options = {}) {
  const config = {
    timeout: options.timeout || 15000,
    headers: {
      'User-Agent': options.userAgent || SCRAPER.USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      ...options.headers,
    },
    ...options,
  };

  // 代理支持
  if (process.env.SOCKS_PROXY) {
    config.httpAgent = new SocksProxyAgent(process.env.SOCKS_PROXY);
    config.httpsAgent = new SocksProxyAgent(process.env.SOCKS_PROXY);
  }

  return axios.create(config);
}

/**
 * 简单的 GET 请求（带缓存）
 */
async function fetch(url, options = {}) {
  const cacheKey = `${url}:${JSON.stringify(options.params || {})}`;

  // 检查缓存
  if (options.cache !== false && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.time < CACHE_TTL) {
      logger.debug({ url, cached: true }, 'HTTP cache hit');
      return cached.data;
    }
    cache.delete(cacheKey);
  }

  const client = createClient(options);

  try {
    const response = await client.get(url, { params: options.params });

    // 缓存响应
    if (options.cache !== false) {
      cache.set(cacheKey, { data: response.data, time: Date.now() });
    }

    return response.data;
  } catch (error) {
    logger.error({ url, error: error.message }, 'HTTP fetch failed');
    throw error;
  }
}

/**
 * 获取并解析 HTML（使用 Cheerio）
 */
async function fetchHTML(url, options = {}) {
  const html = await fetch(url, { ...options, responseType: 'text' });
  return cheerio.load(html);
}

/**
 * 获取 JSON API
 */
async function fetchJSON(url, options = {}) {
  const data = await fetch(url, options);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

/**
 * 带重试的请求
 */
async function fetchWithRetry(url, options = {}) {
  const maxRetries = options.retries || SCRAPER.MAX_RETRIES || 3;
  const delay = options.retryDelay || 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      logger.warn({ url, attempt: i + 1, error: error.message }, 'Retrying HTTP request');
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

/**
 * 批量请求（带并发控制）
 */
async function fetchBatch(urls, options = {}) {
  const concurrency = options.concurrency || 3;
  const results = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(url => fetch(url, options).catch(err => ({ error: err.message, url }))),
    );
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : r.reason));

    // 批次间延迟
    if (i + concurrency < urls.length && options.delay) {
      await new Promise(r => setTimeout(r, options.delay));
    }
  }

  return results;
}

/**
 * 清理缓存
 */
function clearCache() {
  cache.clear();
  logger.info('HTTP cache cleared');
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
  };
}

module.exports = {
  fetch,
  fetchHTML,
  fetchJSON,
  fetchWithRetry,
  fetchBatch,
  createClient,
  clearCache,
  getCacheStats,
};
