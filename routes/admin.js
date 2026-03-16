'use strict';

/**
 * 管理接口路由
 * 需要 API Key 认证的写操作接口
 */

const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');

module.exports = function createAdminRoutes(deps) {
  const { lifecycleManager, pushManager, runAllScrapers, runDailyReport, runWeeklyReport, apiKeyGuard } = deps;

  // ── 归档数据查询接口 ───────────────────────────────────────────────────────
  router.get('/archive', async (req, res, next) => {
    try {
      if (!lifecycleManager) {
        return res.status(503).json({ success: false, error: 'Lifecycle manager not available' });
      }

      const options = {
        source: req.query.source,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: Math.min(500, parseInt(req.query.limit, 10) || 100),
      };

      const data = lifecycleManager.queryArchive(options);
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to query archive');
      next(err);
    }
  });

  // ── 统计数据查询接口 ───────────────────────────────────────────────────────
  router.get('/history-stats', async (req, res, next) => {
    try {
      if (!lifecycleManager) {
        return res.status(503).json({ success: false, error: 'Lifecycle manager not available' });
      }

      const options = {
        source: req.query.source,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      const data = lifecycleManager.queryStats(options);
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to query history stats');
      next(err);
    }
  });

  // ── 数据清理接口（需要 API Key）────────────────────────────────────────────
  router.post('/cleanup', apiKeyGuard, async (req, res, next) => {
    try {
      if (!lifecycleManager) {
        return res.status(503).json({ success: false, error: 'Lifecycle manager not available' });
      }

      const stats = await lifecycleManager.cleanup();
      logger.info({ stats }, 'Data cleanup completed');
      res.json({ success: true, stats });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to cleanup data');
      next(err);
    }
  });

  // ── 按来源删除数据（需要 API Key）──────────────────────────────────────────
  router.delete('/news-by-source/:source', apiKeyGuard, async (req, res, next) => {
    try {
      const source = req.params.source;
      if (!source) {
        return res.status(400).json({ success: false, error: 'Missing source parameter' });
      }

      const results = { sqlite: 0, supabase: 0 };

      // 删除本地 SQLite
      const dbModule = require('../db');
      if (dbModule.db) {
        const r = dbModule.db.prepare('DELETE FROM news WHERE source = ?').run(source);
        results.sqlite = r.changes;
        logger.info({ source, deleted: r.changes }, 'Deleted SQLite rows');
      }

      // 删除 Supabase
      if (dbModule.supabase) {
        const { error, count } = await dbModule.supabase
          .from('news')
          .delete()
          .eq('source', source);
        if (error) {
          logger.error({ error, source }, 'Supabase delete error');
        } else {
          results.supabase = count || 0;
          logger.info({ source, deleted: count }, 'Deleted Supabase rows');
        }
      }

      res.json({ success: true, source, deleted: results });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to delete news by source');
      next(err);
    }
  });

  // ── 测试推送接口（需要 API Key）────────────────────────────────────────────
  router.post('/push-test', apiKeyGuard, async (req, res, next) => {
    try {
      if (!pushManager) {
        return res.status(503).json({ success: false, error: 'Push manager not available' });
      }

      const { channel, message } = req.body;
      const testMessage = message || {
        title: 'Alpha Radar 测试消息',
        content: '这是一条测试推送消息。\n\n如果您收到此消息，说明推送配置正确。\n\n时间：' + new Date().toLocaleString('zh-CN'),
        type: 'markdown',
      };

      let result;
      if (channel) {
        result = await pushManager.pushTo(channel, testMessage);
      } else {
        result = await pushManager.pushToAll(testMessage);
      }

      logger.info({ channel: channel || 'all', success: result.success }, 'Push test completed');
      res.json({ success: true, result });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to send push test');
      next(err);
    }
  });

  // ── 手动触发爬虫（需要 API Key）────────────────────────────────────────────
  router.post('/refresh', apiKeyGuard, async (req, res, next) => {
    try {
      const data = await runAllScrapers();
      logger.info({ count: data.length }, 'Manual refresh completed');
      res.json({ success: true, count: data.length, data: data.slice(0, 10) });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to refresh');
      next(err);
    }
  });

  // ── 生成日报（需要 API Key）────────────────────────────────────────────────
  router.post('/daily-report', apiKeyGuard, async (req, res, next) => {
    try {
      const dryRun = req.query.dryRun === 'true';
      const report = await runDailyReport(dryRun);
      logger.info({ dryRun }, 'Daily report generated');
      if (dryRun) {
        res.json({ success: true, dryRun, report: report || null });
      } else {
        res.json({ success: true, dryRun, report: report ? report.substring(0, 500) + '…' : null });
      }
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to generate daily report');
      next(err);
    }
  });

  // ── 生成周报（需要 API Key）────────────────────────────────────────────────
  router.post('/weekly-report', apiKeyGuard, async (req, res, next) => {
    try {
      const dryRun = req.query.dryRun === 'true';
      const report = await runWeeklyReport(dryRun);
      logger.info({ dryRun }, 'Weekly report generated');
      if (dryRun) {
        res.json({ success: true, dryRun, report: report || null });
      } else {
        res.json({ success: true, dryRun, report: report ? report.substring(0, 500) + '…' : null });
      }
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to generate weekly report');
      next(err);
    }
  });

  return router;
};
