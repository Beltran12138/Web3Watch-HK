'use strict';
/**
 * data-lifecycle.js — 数据生命周期管理模块
 *
 * 实现数据分级存储和自动清理：
 * - 热数据（7天）：完整字段，高频查询
 * - 温数据（30天）：精简字段，归档存储
 * - 冷数据（90天）：仅保留统计维度
 */

const { DATA_RETENTION } = require('./config');

// 默认配置
const DEFAULT_RETENTION = {
  HOT_DAYS: 7,
  WARM_DAYS: 30,
  COLD_DAYS: 90,
};

const retention = DATA_RETENTION || DEFAULT_RETENTION;

// ── SQL 语句定义 ─────────────────────────────────────────────────────────────
const LIFECYCLE_SQL = {
  // 创建归档表
  createArchiveTable: `
    CREATE TABLE IF NOT EXISTS news_archive (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      business_category TEXT,
      competitor_category TEXT,
      is_important INTEGER DEFAULT 0,
      alpha_score INTEGER,
      timestamp INTEGER,
      archived_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_archive_timestamp ON news_archive(timestamp);
    CREATE INDEX IF NOT EXISTS idx_archive_source ON news_archive(source);
  `,

  // 创建统计表
  createStatsTable: `
    CREATE TABLE IF NOT EXISTS news_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      category TEXT,
      count INTEGER DEFAULT 0,
      important_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_stats_date ON news_stats(date);
    CREATE INDEX IF NOT EXISTS idx_stats_source ON news_stats(source);
  `,

  // 迁移温数据（7-30天）到归档表
  archiveWarmData: `
    INSERT OR REPLACE INTO news_archive 
    SELECT id, title, source, url, business_category, competitor_category, 
           is_important, alpha_score, timestamp, strftime('%s', 'now') * 1000
    FROM news
    WHERE timestamp < ? 
      AND timestamp >= ?
      AND id NOT IN (SELECT id FROM news_archive);
  `,

  // 删除已归档的温数据
  deleteArchivedWarmData: `
    DELETE FROM news
    WHERE timestamp < ? 
      AND timestamp >= ?
      AND id IN (SELECT id FROM news_archive);
  `,

  // 统计冷数据（30-90天）
  aggregateColdData: `
    INSERT INTO news_stats (date, source, category, count, important_count)
    SELECT 
      date(datetime(timestamp/1000, 'unixepoch')),
      source,
      business_category,
      COUNT(*),
      SUM(CASE WHEN is_important = 1 THEN 1 ELSE 0 END)
    FROM news
    WHERE timestamp < ? 
      AND timestamp >= ?
    GROUP BY date(datetime(timestamp/1000, 'unixepoch')), source, business_category
    ON CONFLICT(date, source, category) DO UPDATE SET
      count = count + excluded.count,
      important_count = important_count + excluded.important_count;
  `,

  // 删除已统计的冷数据
  deleteAggregatedColdData: `
    DELETE FROM news
    WHERE timestamp < ? 
      AND timestamp >= ?;
  `,

  // 清理超冷数据（>90天）
  deleteSuperColdData: `
    DELETE FROM news_archive
    WHERE timestamp < ?;
  `,

  // 清理旧统计
  deleteOldStats: `
    DELETE FROM news_stats
    WHERE date < date('now', '-1 year');
  `,

  // 获取存储统计
  getStorageStats: `
    SELECT 
      'news' as table_name,
      COUNT(*) as count,
      MIN(timestamp) as oldest,
      MAX(timestamp) as newest
    FROM news
    UNION ALL
    SELECT 
      'news_archive' as table_name,
      COUNT(*) as count,
      MIN(timestamp) as oldest,
      MAX(timestamp) as newest
    FROM news_archive
    UNION ALL
    SELECT 
      'news_stats' as table_name,
      COUNT(*) as count,
      NULL as oldest,
      NULL as newest
    FROM news_stats;
  `,

  // 清理内容字段（压缩热数据）
  compressHotData: `
    UPDATE news
    SET content = NULL,
        detail = CASE 
          WHEN detail IS NULL THEN NULL
          WHEN length(detail) > 200 THEN substr(detail, 1, 200) || '...'
          ELSE detail
        END
    WHERE timestamp < ?
      AND (content IS NOT NULL OR length(detail) > 200);
  `,

  // VACUUM
  vacuum: 'VACUUM;',
};

// ── 生命周期管理类 ───────────────────────────────────────────────────────────
class DataLifecycleManager {
  constructor(db) {
    this.db = db;
    this.init();
  }

  init() {
    // 创建归档表和统计表
    this.db.exec(LIFECYCLE_SQL.createArchiveTable);
    this.db.exec(LIFECYCLE_SQL.createStatsTable);
    console.log('[Lifecycle] Archive and stats tables initialized');
  }

  // 获取时间戳边界
  getTimeBoundaries() {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      hotBoundary: now - (retention.HOT_DAYS * dayMs),
      warmBoundary: now - (retention.WARM_DAYS * dayMs),
      coldBoundary: now - (retention.COLD_DAYS * dayMs),
    };
  }

  // 执行清理任务
  async cleanup() {
    console.log('[Lifecycle] Starting cleanup task...');
    const startTime = Date.now();
    const stats = {
      archived: 0,
      deleted: 0,
      compressed: 0,
      errors: [],
    };

    try {
      const { hotBoundary, warmBoundary, coldBoundary } = this.getTimeBoundaries();

      // 1. 压缩热数据（7-30天）
      const compressResult = this.compressHotData(hotBoundary);
      stats.compressed = compressResult.changes;

      // 2. 归档温数据（7-30天）
      const archiveResult = this.archiveWarmData(hotBoundary, warmBoundary);
      stats.archived = archiveResult.archived;

      // 3. 聚合并删除冷数据（30-90天）
      const coldResult = this.processColdData(warmBoundary, coldBoundary);
      stats.deleted += coldResult.deleted;

      // 4. 清理超冷归档数据（>90天）
      const superColdResult = this.deleteSuperColdData(coldBoundary);
      stats.deleted += superColdResult.deleted;

      // 5. 清理旧统计数据
      this.deleteOldStats();

      // 6. 执行 VACUUM 释放空间
      this.vacuum();

    } catch (err) {
      console.error('[Lifecycle] Cleanup error:', err);
      stats.errors.push(err.message);
    }

    const duration = Date.now() - startTime;
    console.log(`[Lifecycle] Cleanup completed in ${duration}ms:`, stats);

    return stats;
  }

  // 压缩热数据
  compressHotData(hotBoundary) {
    try {
      const stmt = this.db.prepare(LIFECYCLE_SQL.compressHotData);
      const result = stmt.run(hotBoundary);
      console.log(`[Lifecycle] Compressed ${result.changes} hot records`);
      return result;
    } catch (err) {
      console.error('[Lifecycle] Compress hot data error:', err);
      return { changes: 0 };
    }
  }

  // 归档温数据
  archiveWarmData(hotBoundary, warmBoundary) {
    try {
      // 先归档
      const archiveStmt = this.db.prepare(LIFECYCLE_SQL.archiveWarmData);
      const archiveResult = archiveStmt.run(hotBoundary, warmBoundary);
      const archived = archiveResult.changes;

      // 再删除原表数据
      if (archived > 0) {
        const deleteStmt = this.db.prepare(LIFECYCLE_SQL.deleteArchivedWarmData);
        deleteStmt.run(hotBoundary, warmBoundary);
      }

      console.log(`[Lifecycle] Archived ${archived} warm records`);
      return { archived };
    } catch (err) {
      console.error('[Lifecycle] Archive warm data error:', err);
      return { archived: 0 };
    }
  }

  // 处理冷数据
  processColdData(warmBoundary, coldBoundary) {
    try {
      // 先聚合统计
      const aggregateStmt = this.db.prepare(LIFECYCLE_SQL.aggregateColdData);
      aggregateStmt.run(warmBoundary, coldBoundary);

      // 再删除原数据
      const deleteStmt = this.db.prepare(LIFECYCLE_SQL.deleteAggregatedColdData);
      const deleteResult = deleteStmt.run(warmBoundary, coldBoundary);
      const deleted = deleteResult.changes;

      console.log(`[Lifecycle] Processed and deleted ${deleted} cold records`);
      return { deleted };
    } catch (err) {
      console.error('[Lifecycle] Process cold data error:', err);
      return { deleted: 0 };
    }
  }

  // 删除超冷归档数据
  deleteSuperColdData(coldBoundary) {
    try {
      const stmt = this.db.prepare(LIFECYCLE_SQL.deleteSuperColdData);
      const result = stmt.run(coldBoundary);
      const deleted = result.changes;

      if (deleted > 0) {
        console.log(`[Lifecycle] Deleted ${deleted} super-cold archived records`);
      }
      return { deleted };
    } catch (err) {
      console.error('[Lifecycle] Delete super cold data error:', err);
      return { deleted: 0 };
    }
  }

  // 删除旧统计
  deleteOldStats() {
    try {
      const stmt = this.db.prepare(LIFECYCLE_SQL.deleteOldStats);
      const result = stmt.run();
      if (result.changes > 0) {
        console.log(`[Lifecycle] Deleted ${result.changes} old stats records`);
      }
      return result;
    } catch (err) {
      console.error('[Lifecycle] Delete old stats error:', err);
      return { changes: 0 };
    }
  }

  // 执行 VACUUM
  vacuum() {
    try {
      this.db.exec(LIFECYCLE_SQL.vacuum);
      console.log('[Lifecycle] Database vacuum completed');
    } catch (err) {
      console.error('[Lifecycle] Vacuum error:', err);
    }
  }

  // 获取存储统计
  getStorageStats() {
    try {
      const stmt = this.db.prepare(LIFECYCLE_SQL.getStorageStats);
      const stats = stmt.all();

      // 计算数据库文件大小
      const fs = require('fs');
      const path = require('path');
      const dbPath = process.env.DB_PATH || path.join(__dirname, 'alpha_radar.db');

      let fileSize = 0;
      try {
        const stat = fs.statSync(dbPath);
        fileSize = stat.size;
      } catch (e) {
        // ignore
      }

      return {
        tables: stats,
        fileSize,
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
        retention,
      };
    } catch (err) {
      console.error('[Lifecycle] Get storage stats error:', err);
      return { error: err.message };
    }
  }

  // 查询归档数据
  queryArchive(options = {}) {
    const { source, startDate, endDate, limit = 100 } = options;

    let sql = 'SELECT * FROM news_archive WHERE 1=1';
    const params = [];

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }
    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(new Date(startDate).getTime());
    }
    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(new Date(endDate).getTime());
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error('[Lifecycle] Query archive error:', err);
      return [];
    }
  }

  // 查询统计数据
  queryStats(options = {}) {
    const { source, startDate, endDate } = options;

    let sql = 'SELECT * FROM news_stats WHERE 1=1';
    const params = [];

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }
    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY date DESC';

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error('[Lifecycle] Query stats error:', err);
      return [];
    }
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────────────
module.exports = {
  DataLifecycleManager,
  LIFECYCLE_SQL,
};
