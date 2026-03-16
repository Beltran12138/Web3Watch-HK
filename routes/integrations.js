'use strict';

/**
 * routes/integrations.js — 第三方集成管理 API
 *
 * 提供 Notion、GitHub 等集成的配置和管理接口
 */

const express = require('express');
const router = express.Router();

// 懒加载集成模块（避免未配置时报错）
let notionIntegration = null;
let githubIntegration = null;

try {
  notionIntegration = require('../integrations/notion').notionIntegration;
} catch (e) {
  console.warn('[Integrations API] Notion module not available');
}

try {
  githubIntegration = require('../integrations/github').githubIntegration;
} catch (e) {
  console.warn('[Integrations API] GitHub module not available');
}

// ── Notion 相关接口 ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/integrations/notion/status:
 *   get:
 *     summary: 获取 Notion 集成状态
 *     tags: [Integrations]
 *     responses:
 *       200:
 *         description: Notion 集成状态
 */
router.get('/notion/status', async (req, res) => {
  try {
    const status = notionIntegration?.getStatus() || {
      enabled: false,
      error: 'Module not loaded',
    };
    
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/integrations/notion/sync:
 *   post:
 *     summary: 手动触发 Notion 同步
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               minScore:
 *                 type: integer
 *                 default: 85
 *               limit:
 *                 type: integer
 *                 default: 20
 *     responses:
 *       200:
 *         description: 同步结果
 */
router.post('/notion/sync', async (req, res) => {
  try {
    const { minScore = 85, limit = 20 } = req.body;

    if (!notionIntegration) {
      return res.status(400).json({
        success: false,
        error: 'Notion integration not configured',
      });
    }

    // 从数据库获取最新情报
    const { db } = require('../db');
    const stmt = db.prepare(`
      SELECT * FROM news 
      WHERE alpha_score >= ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const items = stmt.all(minScore, limit);

    // 同步到 Notion
    const result = await notionIntegration.syncBatch(items, { minScore, limit });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('[Integrations API] Notion sync error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ── GitHub 相关接口 ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/integrations/github/status:
 *   get:
 *     summary: 获取 GitHub 集成状态
 *     tags: [Integrations]
 *     responses:
 *       200:
 *         description: GitHub 集成状态
 */
router.get('/github/status', async (req, res) => {
  try {
    const status = githubIntegration?.getStatus() || {
      enabled: false,
      error: 'Module not loaded',
    };
    
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/integrations/github/issues:
 *   post:
 *     summary: 为高价值情报创建 GitHub Issues
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               minScore:
 *                 type: integer
 *                 default: 70
 *               limit:
 *                 type: integer
 *                 default: 10
 *     responses:
 *       200:
 *         description: 创建结果
 */
router.post('/github/issues', async (req, res) => {
  try {
    const { minScore = 70, limit = 10 } = req.body;

    if (!githubIntegration) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    // 从数据库获取最新情报
    const { db } = require('../db');
    const stmt = db.prepare(`
      SELECT * FROM news 
      WHERE alpha_score >= ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const items = stmt.all(minScore, limit);

    // 创建 Issues
    const result = await githubIntegration.createBatchIssues(items, { minScore, limit });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('[Integrations API] GitHub issues error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/integrations/github/export-daily:
 *   post:
 *     summary: 导出当日情报到 GitHub Release
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 日期（YYYY-MM-DD），默认为今天
 *     responses:
 *       200:
 *         description: 导出结果
 */
router.post('/github/export-daily', async (req, res) => {
  try {
    const dateStr = req.body.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr).getTime();
    const endOfDay = startOfDay + 86400000;

    if (!githubIntegration) {
      return res.status(400).json({
        success: false,
        error: 'GitHub integration not configured',
      });
    }

    // 获取当日情报
    const { db } = require('../db');
    const stmt = db.prepare(`
      SELECT * FROM news 
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY alpha_score DESC
    `);
    const items = stmt.all(startOfDay, endOfDay);

    if (items.length === 0) {
      return res.json({
        success: true,
        data: { skipped: true, reason: 'No items for this date' },
      });
    }

    // 导出到 Release
    const result = await githubIntegration.exportDailyToRelease(items, dateStr);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('[Integrations API] GitHub export error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ── 综合状态接口 ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/integrations/status:
 *   get:
 *     summary: 获取所有集成状态
 *     tags: [Integrations]
 *     responses:
 *       200:
 *         description: 所有集成状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      notion: notionIntegration?.getStatus() || { enabled: false },
      github: githubIntegration?.getStatus() || { enabled: false },
    };

    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
