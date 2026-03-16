'use strict';

/**
 * 云端同步接口路由
 * /api/sync/save, /api/sync/load
 */

const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');

module.exports = function createSyncRoutes() {
  // ── 云端同步保存接口 ────────────────────────────────────────────────────────
  router.post('/save', async (req, res, next) => {
    try {
      const { sync_code, read_ids, bookmarks } = req.body;
      if (!sync_code || sync_code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Invalid sync code' });
      }

      const dbModule = require('../db');
      if (dbModule.supabase) {
        await dbModule.supabase.from('user_preferences').upsert(
          { sync_code, read_ids: read_ids || [], bookmarks: bookmarks || [] },
          { onConflict: 'sync_code' },
        );
        logger.info({ sync_code }, 'User preferences saved');
        return res.json({ success: true });
      }
      res.status(503).json({ success: false, error: 'Supabase not configured' });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to save sync data');
      next(err);
    }
  });

  // ── 云端同步加载接口 ────────────────────────────────────────────────────────
  router.get('/load', async (req, res, next) => {
    try {
      const code = (req.query.code || '').trim().toUpperCase();
      if (!code || code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Invalid sync code' });
      }

      const dbModule = require('../db');
      if (dbModule.supabase) {
        const { data, error } = await dbModule.supabase
          .from('user_preferences')
          .select('*')
          .eq('sync_code', code)
          .single();
        if (error || !data) {
          return res.status(404).json({ success: false, error: 'Sync code not found' });
        }
        return res.json({ success: true, data });
      }
      res.status(503).json({ success: false, error: 'Supabase not configured' });
    } catch (err) {
      logger.error({ err, path: req.path }, 'Failed to load sync data');
      next(err);
    }
  });

  return router;
};
