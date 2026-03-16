'use strict';

/**
 * Alpha Radar Server
 * Express 后端服务入口
 */

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const logger = require('./lib/logger');

// 启动时间，用于健康检查
const START_TIME = new Date();

// 全局 app 实例（Vercel serverless 复用）
let app;

// 模块依赖（在 createApp 中初始化）
let deps = {};

/**
 * 初始化模块依赖
 * 统一在应用启动时加载，避免路由处理函数中内联 require
 */
function initDependencies() {
  // 数据库模块
  try {
    const db = require('./db');
    deps.getNews = db.getNews;
    deps.getStats = db.getStats;
    deps.db = db;
    logger.info('DB module loaded successfully');
  } catch (e) {
    logger.error({ err: e }, 'Failed to load DB module');
    deps.getNews = async () => [];
    deps.getStats = async () => ({ total: 0, important: 0, sources: [], categories: [] });
  }

  // 爬虫模块
  try {
    const scrapers = require('./scrapers/index');
    deps.runAllScrapers = scrapers.runAllScrapers;
    logger.info('Scrapers module loaded successfully');
  } catch (e) {
    logger.error({ err: e }, 'Failed to load scrapers module');
    deps.runAllScrapers = async () => [];
  }

  // 报告模块
  try {
    const report = require('./report');
    deps.runDailyReport = report.runDailyReport;
    deps.runWeeklyReport = report.runWeeklyReport;
    logger.info('Report module loaded successfully');
  } catch (e) {
    logger.error({ err: e }, 'Failed to load report module');
    deps.runDailyReport = async () => 'Report unavailable';
    deps.runWeeklyReport = async () => 'Report unavailable';
  }

  // 配置
  try {
    const config = require('./config');
    deps.SERVER = config.SERVER;
    deps.DATA_RETENTION = config.DATA_RETENTION;
  } catch (e) {
    logger.error({ err: e }, 'Failed to load config');
    deps.SERVER = {
      PORT: 3001,
      SCRAPE_HIGH_CRON: '*/5 * * * *',
      SCRAPE_LOW_CRON: '*/30 * * * *',
      DAILY_REPORT_CRON: '0 18 * * *',
      WEEKLY_REPORT_CRON: '0 18 * * 5'
    };
  }

  // 监控系统
  try {
    const { alertManager } = require('./monitoring/alert-manager');
    deps.alertManager = alertManager;
    logger.info('Alert manager initialized');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to init alert manager');
  }

  // 查询缓存
  try {
    const { queryCache } = require('./pipeline');
    deps.queryCache = queryCache;
    logger.info('Query cache initialized');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to init query cache');
  }

  // 数据质量检查器
  try {
    const { qualityChecker } = require('./quality');
    deps.qualityChecker = qualityChecker;
    logger.info('Quality checker initialized');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to init quality checker');
  }

  // 数据生命周期管理
  try {
    const { DataLifecycleManager } = require('./data-lifecycle');
    if (deps.db?.db) {
      deps.lifecycleManager = new DataLifecycleManager(deps.db.db);
      logger.info('Data lifecycle manager initialized');
    }
  } catch (e) {
    logger.warn({ err: e }, 'Failed to init lifecycle manager');
  }

  // 推送管理器
  try {
    const { pushManager } = require('./push-channel');
    deps.pushManager = pushManager;
    logger.info({ channels: pushManager.getEnabledChannels().length }, 'Push manager initialized');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to init push manager');
  }

  // API Key 保护中间件
  deps.apiKeyGuard = function apiKeyGuard(req, res, next) {
    const secret = process.env.API_SECRET;
    if (!secret) return next(); // 未配置则跳过
    // 仅通过 Header 传递 API Key，避免 URL 泄露风险
    const provided = req.headers['x-api-key'];
    if (!provided || provided !== secret) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  // 启动时间
  deps.START_TIME = START_TIME;
}

/**
 * 创建 Express 应用
 */
function createApp() {
  if (app) return app;

  // 初始化所有依赖
  initDependencies();

  app = express();

  // 应用安全中间件（CSP、CORS、限流等）
  const { applySecurity } = require('./security');
  applySecurity(app);

  const PORT = deps.SERVER.PORT;
  app.locals.PORT = PORT;

  // 请求体解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Swagger API 文档（仅非生产环境）
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { setupSwagger } = require('./swagger');
      setupSwagger(app);
      logger.info('Swagger docs available at /api-docs');
    } catch (e) {
      logger.warn({ err: e }, 'Failed to init Swagger');
    }
  }

  // ── 挂载路由 ────────────────────────────────────────────────────────────────

  // 新闻相关路由
  const createNewsRoutes = require('./routes/news');
  app.use('/api', createNewsRoutes(deps));
  app.use('/news', createNewsRoutes(deps)); // 兼容旧路径

  // 管理接口路由
  const createAdminRoutes = require('./routes/admin');
  app.use('/api', createAdminRoutes(deps));

  // 监控接口路由
  const createMonitoringRoutes = require('./routes/monitoring');
  app.use('/api', createMonitoringRoutes(deps));
  app.use('/health', (req, res, next) => {
    // 健康检查别名
    req.url = '/api/health';
    next();
  }, createMonitoringRoutes(deps));

  // 同步接口路由
  const createSyncRoutes = require('./routes/sync');
  app.use('/api/sync', createSyncRoutes());

  // ── SPA fallback (只捕获非 API 路由) ───────────────────────────────────────
  app.use((req, res, next) => {
    // API 路由不应该被 SPA fallback 捕获
    if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/news') || req.path.startsWith('/stats')) {
      return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── 全局错误处理中间件 ──────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    // 避免向客户端暴露敏感信息
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
      success: false,
      error: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack })
    });
  });

  return app;
}

/**
 * 启动定时任务（仅本地环境，Vercel 使用 GitHub Actions）
 */
function startCronJobs() {
  if (process.env.VERCEL === 'true') {
    logger.info('Running on Vercel, cron jobs disabled (use GitHub Actions)');
    return;
  }

  const { runAllScrapers, runDailyReport, runWeeklyReport, lifecycleManager, SERVER, DATA_RETENTION } = deps;

  // 高频抓取（5分钟）
  cron.schedule(SERVER.SCRAPE_HIGH_CRON || '*/5 * * * *', async () => {
    logger.info('Running scheduled high-freq scrape');
    try {
      await runAllScrapers('high');
    } catch (e) {
      logger.error({ err: e }, 'High-freq scrape error');
    }
  });

  // 低频抓取（30分钟）
  cron.schedule(SERVER.SCRAPE_LOW_CRON || '*/30 * * * *', async () => {
    logger.info('Running scheduled low-freq scrape');
    try {
      await runAllScrapers('low');
    } catch (e) {
      logger.error({ err: e }, 'Low-freq scrape error');
    }
  });

  // 日报（每天 18:00 北京时间）
  cron.schedule(SERVER.DAILY_REPORT_CRON, async () => {
    logger.info('Running daily report (18:00 BJT)');
    try {
      await runDailyReport(false);
    } catch (e) {
      logger.error({ err: e }, 'Daily report error');
    }
  }, { timezone: 'Asia/Shanghai' });

  // 周报（每周五 18:00 北京时间）
  cron.schedule(SERVER.WEEKLY_REPORT_CRON, async () => {
    logger.info('Running weekly report (Friday 18:00 BJT)');
    try {
      await runWeeklyReport(false);
    } catch (e) {
      logger.error({ err: e }, 'Weekly report error');
    }
  }, { timezone: 'Asia/Shanghai' });

  // 数据自动清理任务
  if (DATA_RETENTION?.AUTO_CLEANUP_CRON && lifecycleManager) {
    cron.schedule(DATA_RETENTION.AUTO_CLEANUP_CRON, async () => {
      logger.info('Running data cleanup');
      try {
        const stats = await lifecycleManager.cleanup();
        logger.info({ stats }, 'Cleanup completed');
      } catch (e) {
        logger.error({ err: e }, 'Cleanup error');
      }
    });
  }

  logger.info('Cron jobs scheduled');
}

// 本地运行模式
if (require.main === module) {
  const application = createApp();
  const PORT = application.locals.PORT || 3001;

  application.listen(PORT, async () => {
    logger.info({ port: PORT }, `Alpha Radar running on http://localhost:${PORT}`);
    logger.info({
      highCron: deps.SERVER.SCRAPE_HIGH_CRON,
      lowCron: deps.SERVER.SCRAPE_LOW_CRON,
      dailyCron: deps.SERVER.DAILY_REPORT_CRON,
      weeklyCron: deps.SERVER.WEEKLY_REPORT_CRON,
    }, 'Cron configuration');

    // 启动定时任务
    startCronJobs();

    // 数据库为空时执行初始抓取
    try {
      const current = await deps.getNews(1);
      if (current.length === 0) {
        logger.info('DB empty — running initial scrape');
        await deps.runAllScrapers().catch(e => logger.error({ err: e }, 'Initial scrape error'));
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to check initial DB state');
    }
  });
}

// Vercel Serverless 导出
const appInstance = createApp();

module.exports = (req, res) => {
  return appInstance(req, res);
};
