'use strict';

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

function applySecurity(app) {
  // 1. 安全头 - 启用 CSP 并配置允许的 CDN 资源
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://statics.moonshot.cn"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        connectSrc: ["'self'", "https:", "wss:"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false
  }));

  // 2. CORS - 统一配置，生产环境必须设置 CORS_ORIGIN
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  // 如果没有配置 CORS_ORIGIN，开发环境允许所有，生产环境只允许同源
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = allowedOrigins.length > 0
    ? allowedOrigins
    : (isProduction ? false : '*');

  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  }));

  // 3. 读操作限流 (1000 req/15min) - 查询接口
  const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many read requests, please try again later' },
    skip: (req) => req.method !== 'GET' && req.method !== 'HEAD'
  });
  app.use(readLimiter);

  // 4. 写操作限流 (10 req/min) - 保护刷新/报告接口
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many write requests, please slow down' }
  });
  app.use('/api/refresh', writeLimiter);
  app.use('/api/daily-report', writeLimiter);
  app.use('/api/weekly-report', writeLimiter);
  app.use('/api/cleanup', writeLimiter);
  app.use('/api/sync/save', writeLimiter);
  app.use('/api/push-test', writeLimiter);

  return app;
}

module.exports = { applySecurity };
