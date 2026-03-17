'use strict';
/**
 * sqlite-functions.js - SQLite 服务端函数（模拟 Supabase RPC）
 */

const path = require('path');
const Database = require('better-sqlite3');

/**
 * 创建统计函数类
 */
class SQLiteStatsFunctions {
  constructor(db) {
    this.db = db;
  }
  
  // 分类统计
  getCategoryStats(sinceTs = 0) {
    const stmt = this.db.prepare(`
      SELECT business_category, COUNT(*) as n
      FROM news
      WHERE (? = 0 OR timestamp >= ?)
        AND business_category != ''
        AND business_category IS NOT NULL
      GROUP BY business_category
      ORDER BY n DESC
    `);
    return stmt.all(sinceTs, sinceTs);
  }
  
  // 数据源统计
  getSourceStats() {
    const stmt = this.db.prepare(`
      SELECT source, COUNT(*) as n
      FROM news
      GROUP BY source
      ORDER BY n DESC
      LIMIT 30
    `);
    return stmt.all();
  }
  
  // 每日趋势
  getDailyStats(days = 7) {
    const cutoffTs = Date.now() - (days * 24 * 3600 * 1000);
    const stmt = this.db.prepare(`
      SELECT 
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as total,
        SUM(CASE WHEN is_important = 1 THEN 1 ELSE 0 END) as important
      FROM news
      WHERE timestamp >= ?
      GROUP BY DATE(timestamp / 1000, 'unixepoch')
      ORDER BY date DESC
    `);
    return stmt.all(cutoffTs);
  }
  
  // Alpha 分数分布
  getAlphaScoreDist() {
    const stmt = this.db.prepare(`
      SELECT 
        CASE 
          WHEN alpha_score = 0 THEN '0'
          WHEN alpha_score BETWEEN 1 AND 3 THEN '1-3'
          WHEN alpha_score BETWEEN 4 AND 6 THEN '4-6'
          WHEN alpha_score BETWEEN 7 AND 8 THEN '7-8'
          WHEN alpha_score >= 9 THEN '9-10'
          ELSE 'unknown'
        END as score_range,
        COUNT(*) as n
      FROM news
      GROUP BY score_range
      ORDER BY alpha_score
    `);
    return stmt.all();
  }
  
  // 数据库健康
  getDbHealth() {
    const db = this.db;
    return {
      total_records: db.prepare('SELECT COUNT(*) as n FROM news').get().n,
      important_count: db.prepare('SELECT COUNT(*) as n FROM news WHERE is_important=1').get().n,
      sources_count: db.prepare('SELECT COUNT(DISTINCT source) as n FROM news').get().n,
      oldest_record: db.prepare('SELECT MIN(timestamp) as n FROM news').get().n,
      newest_record: db.prepare('SELECT MAX(timestamp) as n FROM news').get().n,
      avg_alpha_score: parseFloat(db.prepare('SELECT ROUND(AVG(alpha_score), 2) as n FROM news WHERE alpha_score > 0').get().n) || 0,
      categories_with_data: db.prepare("SELECT COUNT(DISTINCT business_category) as n FROM news WHERE business_category != ''").get().n,
      last_24h_count: db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp >= ?').get(Date.now() - 86400000).n,
    };
  }
  
  // 清理重复
  cleanupDuplicates() {
    const tx = this.db.transaction(() => {
      const duplicates = this.db.prepare(`
        SELECT title, source, COUNT(*) as cnt, MIN(id) as min_id
        FROM news
        GROUP BY title, source
        HAVING cnt > 1
      `).all();
      
      let deleted = 0;
      const deleteStmt = this.db.prepare('DELETE FROM news WHERE title = ? AND source = ? AND id != ?');
      
      duplicates.forEach(dup => {
        const result = deleteStmt.run(dup.title, dup.source, dup.min_id);
        deleted += result.changes;
      });
      
      return deleted;
    });
    
    return tx();
  }
  
  // 归档旧数据
  archiveOldNews(olderThanDays = 90) {
    const cutoffTs = Date.now() - (olderThanDays * 24 * 3600 * 1000);
    
    const tx = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS news_archive (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          normalized_title TEXT,
          content TEXT,
          detail TEXT DEFAULT '',
          impact TEXT DEFAULT '',
          bitv_action TEXT DEFAULT '',
          source TEXT NOT NULL,
          url TEXT UNIQUE,
          category TEXT,
          business_category TEXT DEFAULT '',
          competitor_category TEXT DEFAULT '',
          timestamp INTEGER,
          is_important INTEGER DEFAULT 0,
          alpha_score INTEGER DEFAULT 0,
          sent_to_wecom INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO news_archive (...)
        SELECT title, normalized_title, content, detail, impact, bitv_action,
               source, url, category, business_category, competitor_category,
               timestamp, is_important, alpha_score, sent_to_wecom, created_at
        FROM news
        WHERE timestamp < ?
      `);
      
      insertStmt.run(cutoffTs);
      
      const deleteStmt = this.db.prepare('DELETE FROM news WHERE timestamp < ?');
      const result = deleteStmt.run(cutoffTs);
      
      return result.changes;
    });
    
    return tx();
  }
}

/**
 * 导出便捷方法
 */
function createStatsAPI(db) {
  const api = new SQLiteStatsFunctions(db);
  return {
    getCategoryStats: (since = 0) => api.getCategoryStats(since),
    getSourceStats: () => api.getSourceStats(),
    getDailyStats: (days = 7) => api.getDailyStats(days),
    getAlphaScoreDist: () => api.getAlphaScoreDist(),
    getDbHealth: () => api.getDbHealth(),
    cleanupDuplicates: () => api.cleanupDuplicates(),
    archiveOldNews: (days = 90) => api.archiveOldNews(days),
  };
}

/**
 * 测试所有函数
 */
function testFunctions(db) {
  console.log('\n[SQLite Functions] Testing...\n');
  
  const stats = createStatsAPI(db);
  
  try {
    const health = stats.getDbHealth();
    console.log(`✓ GET_DB_HEALTH: total=${health.total_records}, important=${health.important_count}`);
  } catch (err) {
    console.error(`✗ GET_DB_HEALTH: ${err.message.substring(0, 60)}`);
  }
  
  try {
    const sources = stats.getSourceStats();
    console.log(`✓ GET_SOURCE_STATS: ${sources.length} sources`);
  } catch (err) {
    console.error(`✗ GET_SOURCE_STATS: ${err.message.substring(0, 60)}`);
  }
  
  try {
    const cats = stats.getCategoryStats();
    console.log(`✓ GET_CATEGORY_STATS: ${cats.length} categories`);
  } catch (err) {
    console.error(`✗ GET_CATEGORY_STATS: ${err.message.substring(0, 60)}`);
  }
  
  try {
    const daily = stats.getDailyStats(7);
    console.log(`✓ GET_DAILY_STATS: ${daily.length} days`);
  } catch (err) {
    console.error(`✗ GET_DAILY_STATS: ${err.message.substring(0, 60)}`);
  }
  
  try {
    const dist = stats.getAlphaScoreDist();
    console.log(`✓ GET_ALPHA_SCORE_DIST: ${dist.length} ranges`);
  } catch (err) {
    console.error(`✗ GET_ALPHA_SCORE_DIST: ${err.message.substring(0, 60)}`);
  }
  
  console.log('');
}

module.exports = {
  SQLiteStatsFunctions,
  createStatsAPI,
  testFunctions,
};
