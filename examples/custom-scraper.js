'use strict';

/**
 * 自定义 Scraper 示例
 * 展示如何创建和注册新的数据源爬虫
 */

const { registry } = require('../lib/scraper-registry');
const { fetchJSON, fetchHTML } = require('../scrapers/http-client');
const logger = require('../lib/logger');

/**
 * 示例 1: 简单的 API 爬虫
 */
async function scrapeExampleAPI() {
  try {
    // 调用第三方 API
    const data = await fetchJSON('https://api.example.com/news', {
      timeout: 10000,
    });

    // 转换为标准格式
    return data.articles.map(item => ({
      title: item.title,
      source: 'ExampleAPI',
      url: item.link,
      category: item.category || 'News',
      timestamp: new Date(item.publishedAt).getTime(),
    }));
  } catch (error) {
    logger.error({ error: error.message }, 'ExampleAPI scrape failed');
    return [];
  }
}

/**
 * 示例 2: HTML 页面爬虫
 */
async function scrapeExampleHTML() {
  try {
    const $ = await fetchHTML('https://example.com/news');
    const items = [];

    $('.news-item').each((i, elem) => {
      const $item = $(elem);
      items.push({
        title: $item.find('.title').text().trim(),
        source: 'ExampleHTML',
        url: $item.find('a').attr('href'),
        category: $item.find('.category').text().trim(),
        timestamp: Date.now(), // 或者从页面解析时间
      });
    });

    return items;
  } catch (error) {
    logger.error({ error: error.message }, 'ExampleHTML scrape failed');
    return [];
  }
}

/**
 * 示例 3: 带分页的爬虫
 */
async function scrapeExamplePaginated() {
  const allItems = [];
  const maxPages = 3;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await fetchJSON(`https://api.example.com/news?page=${page}`);

      if (!data.articles || data.articles.length === 0) break;

      const items = data.articles.map(item => ({
        title: item.title,
        source: 'ExamplePaginated',
        url: item.link,
        category: item.category,
        timestamp: new Date(item.publishedAt).getTime(),
      }));

      allItems.push(...items);

      // 避免请求过快
      if (page < maxPages) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (error) {
      logger.error({ page, error: error.message }, 'ExamplePaginated scrape failed');
      break;
    }
  }

  return allItems;
}

/**
 * 注册自定义爬虫
 */
function registerCustomScrapers() {
  // 注册 API 爬虫
  registry.register('example-api', scrapeExampleAPI, {
    tier: 'low',
    maxAgeHours: 24,
    dedupMode: 'strict',
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60000,
    },
  });

  // 注册 HTML 爬虫
  registry.register('example-html', scrapeExampleHTML, {
    tier: 'low',
    maxAgeHours: 12,
    dedupMode: 'strict',
  });

  // 注册分页爬虫
  registry.register('example-paginated', scrapeExamplePaginated, {
    tier: 'high', // 高频抓取
    maxAgeHours: 6,
    dedupMode: 'strict',
  });

  logger.info('Custom scrapers registered');
}

/**
 * 执行自定义爬虫
 */
async function runCustomScrapers() {
  try {
    // 执行单个爬虫
    const result = await registry.execute('example-api');
    console.log('Scraped', result.length, 'items from example-api');

    // 执行某 tier 的所有爬虫
    const batchResult = await registry.executeByTier('low');
    console.log('Batch result:', batchResult.stats);

    return batchResult;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to run custom scrapers');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  registerCustomScrapers();
  runCustomScrapers();
}

module.exports = {
  scrapeExampleAPI,
  scrapeExampleHTML,
  scrapeExamplePaginated,
  registerCustomScrapers,
  runCustomScrapers,
};
