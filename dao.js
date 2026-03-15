'use strict';

/**
 * dao.js — 数据访问对象 (DAO) 层
 * 
 * 职责：
 *   1. 封装所有数据库操作（SQLite + Supabase）
 *   2. 提供统一的业务接口，隐藏底层 SQL/API 细节
 *   3. 支持记忆系统 (Insights) 的持久化
 */

const { 
  db, 
  supabase, 
  saveNews: rawSaveNews, 
  getNews: rawGetNews, 
  getStats: rawGetStats,
  getAlreadyProcessed: rawGetProcessed,
  updateSentStatus: rawUpdateSentStatus,
  checkIfSent: rawCheckSent,
  updateSourcePush: rawUpdateSourcePush
} = require('./db');

/**
 * 新闻数据访问对象
 */
class NewsDAO {
  /**
   * 批量保存新闻
   */
  async save(items) {
    return await rawSaveNews(items);
  }

  /**
   * 分页获取新闻
   */
  async list(limit = 100, options = {}) {
    const { source, important, search } = options;
    return await rawGetNews(limit, source, important, search);
  }

  /**
   * 检查是否已处理（去重逻辑）
   */
  async getProcessedStatus(items) {
    return await rawGetProcessed(items);
  }

  /**
   * 更新发送状态
   */
  async markAsSent(item) {
    return await rawUpdateSentStatus(item);
  }

  /**
   * 检查是否已发送
   */
  async isSent(url, nTitle) {
    return await rawCheckSent(url, nTitle);
  }

  /**
   * 获取统计信息
   */
  async getStats(since) {
    return await rawGetStats(since);
  }
}

/**
 * 消息源追踪 DAO
 */
class SourceDAO {
  async updatePushStatus(source, timestamp, title) {
    return await rawUpdateSourcePush(source, timestamp, title);
  }
}

/**
 * 记忆系统 (Insights) DAO
 */
class InsightDAO {
  /**
   * 保存或更新一个趋势洞察
   */
  async saveInsight(trend) {
    const row = {
      trend_key:      trend.trend_key,
      summary:        trend.summary,
      evidence_count: trend.evidence_count || 1,
      first_seen:     trend.first_seen     || Date.now(),
      last_updated:   Date.now(),
    };

    console.log(`[InsightDAO] Saving trend: ${row.trend_key}`);

    // SQLite
    try {
      const { STMT } = require('./db');
      if (STMT && STMT.insertInsight) {
        STMT.insertInsight.run(row);
      } else {
        console.warn('[InsightDAO] SQLite STMT.insertInsight not ready');
      }
    } catch (e) {
      console.warn('[InsightDAO SQLite Error]', e.message);
    }

    // Supabase
    if (supabase) {
      try {
        await supabase.from('insights').upsert(row, { onConflict: 'trend_key' });
      } catch (e) {
        console.warn('[InsightDAO Supabase]', e.message);
      }
    }
  }

  /**
   * 获取最近的洞察
   */
  async getRecent(limit = 10) {
    // 优先从 Supabase 获取（多端同步）
    if (supabase) {
      try {
        const { data } = await supabase
          .from('insights')
          .select('*')
          .order('last_updated', { ascending: false })
          .limit(limit);
        if (data) return data;
      } catch (e) {
        console.warn('[InsightDAO getRecent Supabase]', e.message);
      }
    }

    // SQLite 备用
    try {
      const { STMT } = require('./db');
      if (STMT && STMT.getInsights) {
        return STMT.getInsights.all(limit);
      }
    } catch (e) {
      console.warn('[InsightDAO getRecent SQLite]', e.message);
    }
    
    return [];
  }
}

module.exports = {
  newsDAO:    new NewsDAO(),
  sourceDAO:  new SourceDAO(),
  insightDAO: new InsightDAO()
};
