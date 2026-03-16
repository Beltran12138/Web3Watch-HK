'use strict';
/**
 * routes/interest.js — AI 兴趣筛选管理接口
 *
 * 提供 REST API 用于：
 * - 查看/更新用户兴趣配置
 * - 测试兴趣筛选效果
 * - 获取/设置推送阈值
 */

const express = require('express');
const {
  loadUserInterests,
  saveUserInterests,
  filterByInterest,
  getStatus,
  getThreshold,
  updateThreshold,
} = require('../ai-interest-filter');
const { db } = require('../db');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Interest Filter
 *   description: AI 兴趣筛选管理
 */

/**
 * @swagger
 * /api/interest/config:
 *   get:
 *     summary: 获取当前兴趣配置
 *     tags: [Interest Filter]
 *     responses:
 *       200:
 *         description: 兴趣配置信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     interests:
 *                       type: string
 *                     hasCustomInterests:
 *                       type: boolean
 *                     threshold:
 *                       type: integer
 */
router.get('/config', (req, res) => {
  try {
    const status = getStatus();
    const threshold = getThreshold();
    
    res.json({
      success: true,
      data: {
        interests: loadUserInterests(),
        hasCustomInterests: status.hasCustomInterests,
        threshold,
      },
    });
  } catch (err) {
    console.error('[Interest] Error getting config:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/interest/config:
 *   put:
 *     summary: 更新兴趣配置
 *     tags: [Interest Filter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interests:
 *                 type: string
 *                 description: 用户兴趣描述（自然语言）
 *               threshold:
 *                 type: integer
 *                 description: 推送阈值 (0-100)
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/config', async (req, res) => {
  try {
    const { interests, threshold } = req.body;
    
    if (interests !== undefined) {
      const saved = saveUserInterests(interests);
      if (!saved) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save interests',
        });
      }
    }
    
    if (threshold !== undefined) {
      const updated = updateThreshold(threshold);
      if (!updated) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update threshold',
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Configuration updated',
      data: {
        interests: loadUserInterests(),
        threshold: getThreshold(),
      },
    });
  } catch (err) {
    console.error('[Interest] Error updating config:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/interest/test:
 *   post:
 *     summary: 测试兴趣筛选效果
 *     tags: [Interest Filter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               news:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     source:
 *                       type: string
 *               threshold:
 *                 type: integer
 *                 default: 60
 *     responses:
 *       200:
 *         description: 筛选结果
 */
router.post('/test', async (req, res) => {
  try {
    const { news = [], threshold = 60 } = req.body;
    
    if (!news.length) {
      return res.status(400).json({
        success: false,
        error: 'No news items provided',
      });
    }
    
    const filtered = await filterByInterest(news, threshold);
    
    res.json({
      success: true,
      data: {
        original: news.length,
        filtered: filtered.length,
        items: filtered,
      },
    });
  } catch (err) {
    console.error('[Interest] Error testing filter:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/interest/recent:
 *   get:
 *     summary: 获取最近经过兴趣评分的新闻
 *     tags: [Interest Filter]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回数量上限
 *       - in: query
 *         name: min_score
 *         schema:
 *           type: integer
 *           default: 0
 *         description: 最小 interest_score
 *     responses:
 *       200:
 *         description: 新闻列表
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 50, min_score = 0 } = req.query;
    
    // 查询最近带有 interest_score 的新闻
    const stmt = db.prepare(`
      SELECT * FROM news
      WHERE interest_score IS NOT NULL
      AND interest_score >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    const items = stmt.all(parseInt(min_score), parseInt(limit));
    
    res.json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (err) {
    console.error('[Interest] Error fetching recent:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * @swagger
 * /api/interest/status:
 *   get:
 *     summary: 获取兴趣筛选状态
 *     tags: [Interest Filter]
 *     responses:
 *       200:
 *         description: 状态信息
 */
router.get('/status', (req, res) => {
  try {
    const status = getStatus();
    const threshold = getThreshold();
    
    res.json({
      success: true,
      data: {
        ...status,
        threshold,
      },
    });
  } catch (err) {
    console.error('[Interest] Error getting status:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
