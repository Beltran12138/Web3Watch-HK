'use strict';

/**
 * API 使用示例
 * 展示如何调用 Alpha Radar 的各种 API
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_SECRET;

// 创建 axios 实例
const client = axios.create({
  baseURL: BASE_URL,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
});

// 示例 1: 获取新闻列表
async function getNewsExample() {
  try {
    const response = await client.get('/api/news', {
      params: {
        source: 'All',
        limit: 20,
        important: 1,
      },
    });
    console.log('News:', response.data.data.length, 'items');
    return response.data;
  } catch (error) {
    console.error('Failed to get news:', error.message);
  }
}

// 示例 2: 搜索新闻
async function searchNewsExample() {
  try {
    const response = await client.get('/api/news', {
      params: {
        q: 'Bitcoin',
        limit: 10,
      },
    });
    console.log('Search results:', response.data.data.length, 'items');
    return response.data;
  } catch (error) {
    console.error('Failed to search news:', error.message);
  }
}

// 示例 3: 获取统计数据
async function getStatsExample() {
  try {
    const response = await client.get('/api/stats');
    console.log('Stats:', response.data.data);
    return response.data;
  } catch (error) {
    console.error('Failed to get stats:', error.message);
  }
}

// 示例 4: 获取趋势数据
async function getTrendExample() {
  try {
    const response = await client.get('/api/trend', {
      params: {
        days: 7,
        category: '合规',
      },
    });
    console.log('Trend data points:', response.data.data.length);
    return response.data;
  } catch (error) {
    console.error('Failed to get trend:', error.message);
  }
}

// 示例 5: 导出数据
async function exportDataExample() {
  try {
    const response = await client.get('/api/export', {
      params: {
        format: 'csv',
        days: 7,
      },
      responseType: 'blob',
    });
    console.log('Export successful, size:', response.data.length);
    return response.data;
  } catch (error) {
    console.error('Failed to export data:', error.message);
  }
}

// 示例 6: 健康检查
async function healthCheckExample() {
  try {
    const response = await client.get('/api/health');
    console.log('Health status:', response.data.status);
    console.log('Uptime:', response.data.uptime, 'seconds');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

// 示例 7: 触发爬虫（需要 API Key）
async function triggerScrapeExample() {
  if (!API_KEY) {
    console.log('Skipping scrape example (no API key)');
    return;
  }

  try {
    const response = await client.post('/api/refresh');
    console.log('Scrape triggered:', response.data.count, 'items');
    return response.data;
  } catch (error) {
    console.error('Failed to trigger scrape:', error.message);
  }
}

// 示例 8: SSE 实时流
function sseStreamExample() {
  const EventSource = require('eventsource');
  const es = new EventSource(`${BASE_URL}/api/stream?channels=news`);

  es.onopen = () => {
    console.log('SSE connection opened');
  };

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('SSE message:', data);
  };

  es.onerror = (error) => {
    console.error('SSE error:', error);
  };

  // 10秒后关闭
  setTimeout(() => {
    es.close();
    console.log('SSE connection closed');
  }, 10000);
}

// 运行所有示例
async function runAllExamples() {
  console.log('=== Alpha Radar API Examples ===\n');

  await getNewsExample();
  await searchNewsExample();
  await getStatsExample();
  await getTrendExample();
  await healthCheckExample();
  await triggerScrapeExample();

  console.log('\n=== Examples completed ===');
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}

module.exports = {
  getNewsExample,
  searchNewsExample,
  getStatsExample,
  getTrendExample,
  exportDataExample,
  healthCheckExample,
  triggerScrapeExample,
  sseStreamExample,
};
