'use strict';
/**
 * mcp-server/index.js — MCP Server for Alpha-Radar
 *
 * 让 Claude Desktop、Cursor 等 AI 客户端能用自然语言查询新闻情报
 *
 * 工具 (Tools):
 * - get_latest_news: 获取最新新闻
 * - search_news: 搜索新闻
 * - get_stats: 获取统计数据
 * - push_message: 发送推送消息
 *
 * 资源 (Resources):
 * - news://recent: 最近新闻
 * - news://categories: 分类列表
 */

const axios = require('axios');
const { db } = require('../db');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const API_KEY = process.env.API_SECRET || '';

// ── MCP 工具定义 ─────────────────────────────────────────────────────────────

/**
 * MCP Tools 定义
 */
const TOOLS = [
  {
    name: 'get_latest_news',
    description: '获取最新的高价值行业情报。支持按分类、来源、时间范围过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '返回数量上限，默认 20',
          default: 20,
        },
        category: {
          type: 'string',
          description: '业务分类过滤（合规、技术、市场、产品等）',
        },
        source: {
          type: 'string',
          description: '来源过滤（Binance、OKX、HashKey 等）',
        },
        min_score: {
          type: 'number',
          description: '最低 alpha_score 阈值，默认 60',
          default: 60,
        },
        hours: {
          type: 'number',
          description: '时间范围（过去多少小时），默认 24',
          default: 24,
        },
      },
    },
  },
  {
    name: 'search_news',
    description: '根据关键词搜索新闻。支持标题和内容的全文搜索。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        limit: {
          type: 'number',
          description: '返回数量上限，默认 10',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_stats',
    description: '获取情报统计数据，包括各分类数量、趋势分析等。',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: '统计天数，默认 7',
          default: 7,
        },
      },
    },
  },
  {
    name: 'push_message',
    description: '发送推送消息到所有配置的渠道（企业微信、钉钉、Telegram 等）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '消息标题',
        },
        content: {
          type: 'string',
          description: '消息内容（支持 Markdown）',
        },
        urgent: {
          type: 'boolean',
          description: '是否紧急推送',
          default: false,
        },
      },
      required: ['title', 'content'],
    },
  },
];

// ── MCP 资源定义 ─────────────────────────────────────────────────────────────

/**
 * MCP Resources 定义
 */
const RESOURCES = [
  {
    uri: 'news://recent',
    name: 'Recent News',
    description: '最近 24 小时内的高价值情报',
    mimeType: 'application/json',
  },
  {
    uri: 'news://categories',
    name: 'News Categories',
    description: '所有业务分类及其说明',
    mimeType: 'application/json',
  },
];

// ── 工具实现 ─────────────────────────────────────────────────────────────────

/**
 * 获取最新新闻
 */
async function getLatestNews(params = {}) {
  const {
    limit = 20,
    category,
    source,
    min_score = 60,
    hours = 24,
  } = params;

  try {
    // 构建查询参数
    const queryParams = new URLSearchParams({
      limit: String(limit),
      min_score: String(min_score),
    });

    if (category) queryParams.append('category', category);
    if (source) queryParams.append('source', source);

    // 计算时间戳
    const sinceTime = Date.now() - hours * 60 * 60 * 1000;
    queryParams.append('since', String(sinceTime));

    const url = `${API_BASE_URL}/news?${queryParams.toString()}`;
    
    const headers = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await axios.get(url, { headers, timeout: 10000 });
    
    return {
      success: true,
      data: response.data.data || response.data,
      count: response.data.count || response.data.length,
      metadata: {
        query: params,
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    console.error('[MCP] get_latest_news error:', err.message);
    
    // 降级：直接从数据库查询
    return getLatestNewsFromDB(params);
  }
}

/**
 * 从数据库直接获取最新新闻（降级方案）
 */
function getLatestNewsFromDB(params = {}) {
  const {
    limit = 20,
    category,
    source,
    min_score = 60,
    hours = 24,
  } = params;

  try {
    const sinceTime = Date.now() - hours * 60 * 60 * 1000;

    let query = `
      SELECT * FROM news
      WHERE (is_important = 1 OR alpha_score >= ?)
      AND timestamp >= ?
    `;
    const stmtParams = [min_score, sinceTime];

    if (category) {
      query += ' AND business_category = ?';
      stmtParams.push(category);
    }

    if (source) {
      query += ' AND source = ?';
      stmtParams.push(source);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    stmtParams.push(limit);

    const stmt = db.prepare(query);
    const items = stmt.all(...stmtParams);

    return {
      success: true,
      data: items,
      count: items.length,
      metadata: {
        query: params,
        timestamp: Date.now(),
        source: 'sqlite',
      },
    };
  } catch (err) {
    console.error('[MCP] getLatestNewsFromDB error:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * 搜索新闻
 */
async function searchNews(params = {}) {
  const { query = '', limit = 10 } = params;

  if (!query) {
    return {
      success: false,
      error: 'Query is required',
    };
  }

  try {
    const url = `${API_BASE_URL}/news/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    
    const headers = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await axios.get(url, { headers, timeout: 10000 });
    
    return {
      success: true,
      data: response.data.data || response.data,
      count: response.data.count || response.data.length,
    };
  } catch (err) {
    console.error('[MCP] search_news error:', err.message);
    
    // 降级：SQLite 全文搜索
    return searchNewsFromDB(params);
  }
}

/**
 * 从数据库搜索新闻（降级方案）
 */
function searchNewsFromDB(params = {}) {
  const { query = '', limit = 10 } = params;

  try {
    const stmt = db.prepare(`
      SELECT * FROM news
      WHERE title LIKE ? OR content LIKE ? OR detail LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const searchTerm = `%${query}%`;
    const items = stmt.all(searchTerm, searchTerm, searchTerm, limit);

    return {
      success: true,
      data: items,
      count: items.length,
    };
  } catch (err) {
    console.error('[MCP] searchNewsFromDB error:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * 获取统计数据
 */
async function getStats(params = {}) {
  const { days = 7 } = params;

  try {
    const url = `${API_BASE_URL}/stats?days=${days}`;
    
    const headers = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await axios.get(url, { headers, timeout: 10000 });
    
    return {
      success: true,
      data: response.data.data || response.data,
    };
  } catch (err) {
    console.error('[MCP] get_stats error:', err.message);
    
    // 降级：直接从数据库查询
    return getStatsFromDB(params);
  }
}

/**
 * 从数据库获取统计数据（降级方案）
 */
function getStatsFromDB(params = {}) {
  const { days = 7 } = params;

  try {
    const sinceTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // 分类统计
    const categoryStmt = db.prepare(`
      SELECT business_category, COUNT(*) as count
      FROM news
      WHERE timestamp >= ?
      GROUP BY business_category
      ORDER BY count DESC
    `);

    // 来源统计
    const sourceStmt = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM news
      WHERE timestamp >= ?
      GROUP BY source
      ORDER BY count DESC
    `);

    // 趋势统计
    const trendStmt = db.prepare(`
      SELECT 
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as count,
        AVG(alpha_score) as avg_score
      FROM news
      WHERE timestamp >= ?
      GROUP BY date
      ORDER BY date DESC
    `);

    const categories = categoryStmt.all(sinceTime);
    const sources = sourceStmt.all(sinceTime);
    const trends = trendStmt.all(sinceTime);

    return {
      success: true,
      data: {
        period: `${days} days`,
        categories,
        sources,
        trends,
        total: categories.reduce((sum, c) => sum + c.count, 0),
      },
    };
  } catch (err) {
    console.error('[MCP] getStatsFromDB error:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * 发送推送消息
 */
async function pushMessage(params = {}) {
  const { title, content, urgent = false } = params;

  if (!title || !content) {
    return {
      success: false,
      error: 'Title and content are required',
    };
  }

  try {
    const url = `${API_BASE_URL}/admin/push`;
    
    const headers = {
      'Content-Type': 'application/json',
    };
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    const response = await axios.post(url, {
      title,
      content,
      type: urgent ? 'urgent' : 'markdown',
    }, { headers, timeout: 10000 });

    return {
      success: true,
      data: response.data,
      message: 'Message pushed successfully',
    };
  } catch (err) {
    console.error('[MCP] push_message error:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

// ── 资源实现 ─────────────────────────────────────────────────────────────────

/**
 * 读取资源
 */
async function readResource(uri) {
  switch (uri) {
    case 'news://recent':
      return await getLatestNews({ limit: 50, hours: 24 });
    
    case 'news://categories':
      return {
        success: true,
        data: {
          categories: [
            { name: '合规', description: '监管政策、牌照申请、合规要求' },
            { name: '技术', description: '技术升级、安全事件、链上动态' },
            { name: '市场', description: '市场动态、竞争格局、业务拓展' },
            { name: '产品', description: '新产品上线、功能更新' },
            { name: '合作', description: '战略合作、投资并购' },
            { name: '其他', description: '其他类别' },
          ],
        },
      };
    
    default:
      return {
        success: false,
        error: `Unknown resource: ${uri}`,
      };
  }
}

// ── MCP Server 主类 ──────────────────────────────────────────────────────────

class MCPServer {
  constructor() {
    this.tools = TOOLS;
    this.resources = RESOURCES;
    this.toolHandlers = {
      get_latest_news: getLatestNews,
      search_news: searchNews,
      get_stats: getStats,
      push_message: pushMessage,
    };
  }

  /**
   * 处理工具调用
   */
  async callTool(name, args) {
    const handler = this.toolHandlers[name];
    if (!handler) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
    }

    try {
      return await handler(args);
    } catch (err) {
      console.error(`[MCP] Tool ${name} error:`, err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 读取资源
   */
  async readResource(uri) {
    try {
      return await readResource(uri);
    } catch (err) {
      console.error(`[MCP] Resource ${uri} error:`, err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 获取服务器信息
   */
  getInfo() {
    return {
      name: 'Alpha-Radar MCP Server',
      version: '1.0.0',
      description: 'Web3/Crypto 行业情报聚合系统 MCP 接口',
      tools: this.tools.map(t => ({ name: t.name, description: t.description })),
      resources: this.resources.map(r => ({ uri: r.uri, name: r.name })),
    };
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────────────

const mcpServer = new MCPServer();

module.exports = {
  mcpServer,
  MCPServer,
  TOOLS,
  RESOURCES,
  // 直接导出工具函数便于测试
  getLatestNews,
  searchNews,
  getStats,
  pushMessage,
  readResource,
};
