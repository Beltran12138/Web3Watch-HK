'use strict';

/**
 * routes/health.js — 数据源健康监控 API
 *
 * 提供数据源健康状态的查询和管理接口
 */

const express = require('express');
const { sourceHealthMonitor } = require('../monitoring/source-health');
const { scraperManager } = require('../scrapers');

const router = express.Router();

/**
 * @swagger
 * /api/health/sources:
 *   get:
 *     summary: 获取所有数据源的健康状态
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 数据源健康状态列表
 */
router.get('/sources', async (req, res) => {
  try {
    const status = sourceHealthMonitor.getHealthStatus();
    res.json({
      success: true,
      data: status,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[Health API] Error getting source health:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/health/sources/:source:
 *   get:
 *     summary: 获取单个数据源的详细健康信息
 *     tags: [Health]
 *     parameters:
 *       - in: path
 *         name: source
 *         required: true
 *         schema:
 *           type: string
 *         description: 数据源名称
 *     responses:
 *       200:
 *         description: 数据源详细信息
 */
router.get('/sources/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const detail = sourceHealthMonitor.getSourceDetail(source);

    if (!detail) {
      return res.status(404).json({
        success: false,
        error: `Source "${source}" not found`,
      });
    }

    res.json({
      success: true,
      data: detail,
    });
  } catch (err) {
    console.error('[Health API] Error getting source detail:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/health/check:
 *   post:
 *     summary: 手动触发健康检查和告警
 *     tags: [Health]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: 健康检查结果
 */
router.post('/check', async (req, res) => {
  try {
    const alerts = await sourceHealthMonitor.checkHealthAndAlert();
    res.json({
      success: true,
      alerts,
      alertCount: alerts.length,
    });
  } catch (err) {
    console.error('[Health API] Error checking health:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/health/sources/:source/reset:
 *   post:
 *     summary: 重置指定数据源的健康状态
 *     tags: [Health]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: source
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 重置成功
 */
router.post('/sources/:source/reset', async (req, res) => {
  try {
    const { source } = req.params;
    sourceHealthMonitor.resetSource(source);
    res.json({
      success: true,
      message: `Source "${source}" state reset`,
    });
  } catch (err) {
    console.error('[Health API] Error resetting source:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/health/stats:
 *   get:
 *     summary: 获取统计数据（用于报告）
 *     tags: [Health]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: 统计天数
 *     responses:
 *       200:
 *         description: 统计数据
 */
router.get('/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = sourceHealthMonitor.exportStats(days);
    res.json({
      success: true,
      data: stats,
      period: `${days} days`,
    });
  } catch (err) {
    console.error('[Health API] Error exporting stats:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/health/trigger-fetch:
 *   post:
 *     summary: 手动触发指定数据源的抓取
 *     tags: [Health]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *                 description: 数据源名称
 *     responses:
 *       200:
 *         description: 抓取结果
 */
router.post('/trigger-fetch', async (req, res) => {
  try {
    const { source } = req.body;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: 'Source is required',
      });
    }

    // 调用 scrapers 的单个源抓取功能
    // 注意：这里需要 scrapers/index.js 导出 singleSourceFetch 方法
    res.json({
      success: true,
      message: `Fetch triggered for ${source}`,
      note: 'This feature requires scraper manager integration',
    });
  } catch (err) {
    console.error('[Health API] Error triggering fetch:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
