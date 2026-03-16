'use strict';

/**
 * integrations/notion.js — Notion 数据库集成
 *
 * 功能：
 *   1. 高价值情报（alpha_score >= 85）自动写入 Notion 数据库
 *   2. 支持团队协作标注（已读/待跟进/已处理）
 *   3. 双向同步（可选：从 Notion 读取标注回写到本地 DB）
 *
 * 配置：
 *   NOTION_API_KEY=secret_xxx
 *   NOTION_DATABASE_ID=xxx
 */

const axios = require('axios');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const NOTION_CONFIG = {
  API_KEY: process.env.NOTION_API_KEY,
  DATABASE_ID: process.env.NOTION_DATABASE_ID,
  BASE_URL: 'https://api.notion.com/v1',
  VERSION: '2022-06-28',
};

// ── Notion API 客户端 ───────────────────────────────────────────────────────
class NotionClient {
  constructor() {
    this.apiKey = NOTION_CONFIG.API_KEY;
    this.databaseId = NOTION_CONFIG.DATABASE_ID;
    this.baseUrl = NOTION_CONFIG.BASE_URL;
    this.version = NOTION_CONFIG.VERSION;

    if (!this.apiKey || !this.databaseId) {
      console.warn('[Notion] Not fully configured (missing API_KEY or DATABASE_ID)');
      this.enabled = false;
    } else {
      this.enabled = true;
    }
  }

  /**
   * 发送 API 请求
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const res = await axios.post(url, options, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      return res.data;
    } catch (err) {
      console.error(`[Notion] API error (${endpoint}):`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * 创建页面（添加新条目到数据库）
   */
  async createPage(properties) {
    return await this.request('/pages', {
      parent: { database_id: this.databaseId },
      properties,
    });
  }

  /**
   * 查询数据库
   */
  async queryDatabase(filter) {
    return await this.request('/databases/query', {
      filter,
    });
  }

  /**
   * 更新页面属性
   */
  async updatePage(pageId, properties) {
    const url = `${this.baseUrl}/pages/${pageId}`;
    
    try {
      const res = await axios.patch(url, {
        properties,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      return res.data;
    } catch (err) {
      console.error(`[Notion] Update error:`, err.response?.data || err.message);
      throw err;
    }
  }
}

// ── Notion 集成管理器 ───────────────────────────────────────────────────────
class NotionIntegration {
  constructor() {
    this.client = new NotionClient();
    this.syncedItems = new Set(); // 防止重复同步
  }

  /**
   * 将情报条目转换为 Notion 数据库属性
   */
  buildProperties(item) {
    const scoreColor = item.alpha_score >= 85 ? 'red' : 
                       item.alpha_score >= 60 ? 'yellow' : 'gray';

    return {
      // 标题（必需）
      'Name': {
        title: [
          {
            text: {
              content: item.title.slice(0, 200),
            },
          },
        ],
      },

      // 来源
      'Source': {
        select: {
          name: item.source,
        },
      },

      // 评分
      'Alpha Score': {
        number: item.alpha_score,
      },

      // 评分等级（公式或 select）
      'Priority': {
        select: {
          name: item.alpha_score >= 85 ? '🔴 Critical' :
                item.alpha_score >= 60 ? '🟡 High' :
                item.alpha_score >= 40 ? '🔵 Medium' : '⚪ Low',
        },
      },

      // 业务分类
      'Category': {
        select: {
          name: item.business_category || '未分类',
        },
      },

      // 影响
      'Impact': {
        select: {
          name: item.impact || '中性',
        },
      },

      // 摘要
      'Summary': {
        rich_text: [
          {
            text: {
              content: (item.detail || item.content || '').slice(0, 2000),
            },
          },
        ],
      },

      // 原文链接
      'URL': {
        url: item.url,
      },

      // 时间戳
      'Published Time': {
        date: {
          start: new Date(item.timestamp).toISOString(),
        },
      },

      // 状态（默认待处理）
      'Status': {
        select: {
          name: '待处理',
        },
      },

      // 标签（多选）
      'Tags': {
        multi_select: this.buildTags(item),
      },
    };
  }

  /**
   * 构建标签列表
   */
  buildTags(item) {
    const tags = [];

    if (item.alpha_score >= 85) tags.push('紧急');
    if (item.is_important) tags.push('重要');
    if (item.business_category === '合规') tags.push('合规');
    if (item.business_category === '监管') tags.push('监管');
    if (item.source === 'SFC') tags.push('SFC');

    // 添加趋势相关标签
    if (item.trend_reference) {
      tags.push(`趋势：${item.trend_reference}`);
    }

    return tags.map(name => ({ name }));
  }

  /**
   * 同步单个情报到 Notion
   * @param {Object} item - 情报条目
   * @returns {Promise<Object|null>} - Notion 页面 ID 或 null
   */
  async syncItem(item) {
    if (!this.client.enabled) {
      console.log('[Notion] Disabled, skipping sync');
      return null;
    }

    // 检查是否已同步
    const cacheKey = `${item.id || item.title}-${item.timestamp}`;
    if (this.syncedItems.has(cacheKey)) {
      console.log(`[Notion] Already synced: ${item.title.slice(0, 50)}`);
      return null;
    }

    try {
      const properties = this.buildProperties(item);
      const page = await this.client.createPage(properties);

      this.syncedItems.add(cacheKey);
      console.log(`[Notion] Synced: ${item.title.slice(0, 50)} → ${page.id}`);

      return {
        notionId: page.id,
        url: page.url,
        createdAt: page.created_time,
      };
    } catch (err) {
      console.error('[Notion] Failed to sync item:', err.message);
      return null;
    }
  }

  /**
   * 批量同步高价值情报
   * @param {Array} items - 情报列表
   * @param {Object} options - 选项
   * @returns {Promise<Object>} - 同步结果统计
   */
  async syncBatch(items, options = {}) {
    const {
      minScore = 85,  // 只同步高分情报
      limit = 20,     // 单次最多同步数量
    } = options;

    if (!this.client.enabled) {
      return { success: 0, failed: 0, skipped: items.length, reason: 'disabled' };
    }

    // 过滤高价值情报
    const highValueItems = items
      .filter(item => item.alpha_score >= minScore)
      .slice(0, limit);

    console.log(`[Notion] Syncing ${highValueItems.length} high-value items...`);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      pages: [],
    };

    for (const item of highValueItems) {
      const result = await this.syncItem(item);
      if (result) {
        results.success++;
        results.pages.push({
          title: item.title,
          notionId: result.notionId,
          url: result.url,
        });
      } else if (this.syncedItems.has(`${item.id || item.title}-${item.timestamp}`)) {
        results.skipped++;
      } else {
        results.failed++;
      }

      // 避免速率限制
      if (highValueItems.indexOf(item) < highValueItems.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[Notion] Batch sync complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
    return results;
  }

  /**
   * 从 Notion 读取标注并回写到本地数据库
   * （需要额外的 DAO 支持）
   */
  async syncBackToLocalDB(dao) {
    if (!this.client.enabled) {
      return { synced: 0 };
    }

    try {
      // 查询最近更新的页面
      const queryResult = await this.client.queryDatabase({
        filter: {
          property: 'Last Updated',
          date: {
            past_week: {},
          },
        },
      });

      let syncedCount = 0;
      for (const page of queryResult.results) {
        // 提取标注信息
        const status = page.properties['Status']?.select?.name;
        const tags = page.properties['Tags']?.multi_select?.map(t => t.name) || [];

        if (status && status !== '待处理') {
          // TODO: 调用 DAO 更新本地数据库
          // await dao.updateByNotionId(page.id, { status, tags });
          syncedCount++;
        }
      }

      console.log(`[Notion] Synced back ${syncedCount} updates from Notion`);
      return { synced: syncedCount };
    } catch (err) {
      console.error('[Notion] Sync back failed:', err.message);
      return { synced: 0, error: err.message };
    }
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      enabled: this.client.enabled,
      apiKeyConfigured: !!NOTION_CONFIG.API_KEY,
      databaseConfigured: !!NOTION_CONFIG.DATABASE_ID,
      syncedItemsCount: this.syncedItems.size,
    };
  }
}

// ── 导出单例 ─────────────────────────────────────────────────────────────────
const notionIntegration = new NotionIntegration();

module.exports = {
  notionIntegration,
  NotionIntegration,
  NotionClient,
  NOTION_CONFIG,
};
