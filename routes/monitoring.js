'use strict';

/**
 * 监控和状态接口路由
 * /api/health, /api/monitoring, /api/quality, /api/ai-status, etc.
 */

const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { sseManager } = require('../lib/sse-manager');

module.exports = function createMonitoringRoutes(deps) {
  const { alertManager, pushManager, qualityChecker, queryCache, lifecycleManager, START_TIME } = deps;

  // ── 健康检查（无需认证）─────────────────────────────────────────────────────
  router.get('/health', async (req, res, next) => {
    try {
      const db = require('../db');
      const stats = await db.getStats();

      // 获取 AI 状态
      let aiStatus = null;
      try {
        const { getAIStatus } = require('../ai-enhanced');
        aiStatus = getAIStatus();
      } catch (e) {
        // ignore
      }

      // 获取推送渠道状态
      let pushStatus = null;
      if (pushManager) {
        pushStatus = pushManager.getStatus();
      }

      // 获取存储统计
      let storageStats = null;
      if (lifecycleManager) {
        storageStats = lifecycleManager.getStorageStats();
      }

      res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        startedAt: START_TIME.toISOString(),
        db: {
          total: stats.total,
          important: stats.important,
          sources: stats.sources,
        },
        ai: aiStatus,
        push: pushStatus,
        storage: storageStats,
        version: require('../package.json').version,
      });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Health check failed');
      next(err);
    }
  });

  // ── 推送渠道状态接口 ───────────────────────────────────────────────────────
  router.get('/push-status', (req, res) => {
    if (!pushManager) {
      return res.json({ success: true, channels: [] });
    }

    res.json({
      success: true,
      channels: pushManager.getEnabledChannels(),
    });
  });

  // ── Twitter 抓取状态接口 ───────────────────────────────────────────────────
  router.get('/twitter-status', (req, res, next) => {
    try {
      const { getStats } = require('../scrapers/sources/twitter-enhanced');
      const stats = getStats();
      res.json({ success: true, stats });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to get Twitter status');
      next(err);
    }
  });

  // ── AI 状态接口 ────────────────────────────────────────────────────────────
  router.get('/ai-status', (req, res, next) => {
    try {
      const { getAIStatus } = require('../ai-enhanced');
      const status = getAIStatus();

      // Include cost tracking from ai.js
      let costStatus = null;
      try {
        const { aiCostTracker } = require('../ai');
        costStatus = aiCostTracker.getStatus();
      } catch (_) {
        // AI cost tracking not available
      }

      res.json({ success: true, status, cost: costStatus });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to get AI status');
      next(err);
    }
  });

  // ── 监控状态接口 ────────────────────────────────────────────────────────────
  router.get('/monitoring', (req, res) => {
    if (!alertManager) {
      return res.json({ success: true, data: null, message: 'Alert manager not initialized' });
    }
    res.json({ success: true, data: alertManager.getStatus() });
  });

  // ── 监控日报接口 ────────────────────────────────────────────────────────────
  router.get('/monitoring/digest', (req, res) => {
    if (!alertManager) {
      return res.json({ success: true, digest: 'Alert manager not initialized' });
    }
    res.json({ success: true, digest: alertManager.generateDigest() });
  });

  // ── 数据质量统计接口 ────────────────────────────────────────────────────────
  router.get('/quality', (req, res) => {
    if (!qualityChecker) {
      return res.json({ success: true, data: null, message: 'Quality checker not initialized' });
    }
    res.json({ success: true, data: qualityChecker.getStats() });
  });

  // ── 批量数据质量检查接口 ────────────────────────────────────────────────────
  router.post('/quality/check', async (req, res, next) => {
    try {
      if (!qualityChecker) {
        return res.status(503).json({ success: false, error: 'Quality checker not initialized' });
      }

      const db = require('../db');
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
      const news = await db.getNews(limit);
      const result = qualityChecker.validateBatch(news);
      res.json({ success: true, summary: result.summary });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to check quality');
      next(err);
    }
  });

  // ── 查询缓存状态接口 ────────────────────────────────────────────────────────
  router.get('/cache-status', (req, res) => {
    if (!queryCache) {
      return res.json({ success: true, data: null, message: 'Query cache not initialized' });
    }
    res.json({ success: true, data: queryCache.getStats() });
  });

  // ── 熔断器状态接口 ──────────────────────────────────────────────────────────
  router.get('/circuit-breakers', (req, res) => {
    try {
      const { registry } = require('../lib/circuit-breaker');
      const states = registry.getAllStates();
      res.json({ success: true, data: states });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to get circuit breaker states');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── SSE 实时推送接口 ────────────────────────────────────────────────────────
  router.get('/stream', (req, res) => {
    const channels = (req.query.channels || 'news').split(',');
    const clientId = sseManager.addClient(res, { channels });

    req.on('close', () => {
      sseManager.removeClient(clientId);
    });
  });

  // ── SSE 统计接口 ────────────────────────────────────────────────────────────
  router.get('/stream/stats', (req, res) => {
    res.json({ success: true, data: sseManager.getStats() });
  });

  return router;
};

// 导出 sseManager 供其他模块使用
module.exports.sseManager = sseManager;
