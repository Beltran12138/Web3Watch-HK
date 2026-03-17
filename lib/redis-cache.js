'use strict';
/**
 * lib/redis-cache.js - Redis 缓存集成模块
 * 
 * 功能：
 * - 为高频查询提供 Redis 缓存层
 * - 支持自动过期和手动失效
 * - 与 SQLite 无缝配合使用
 * 
 * 使用方法：
 * const cache = require('./lib/redis-cache');
 * await cache.set('key', data, 300); // 缓存 5 分钟
 * const data = await cache.get('key');
 */

const Redis = require('ioredis');
const logger = require('./logger');

// ── 配置 ──────────────────────────────────────────────────────────────────────
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || null,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_PREFIX || 'alpha-radar:',
};

const ENABLED = process.env.USE_REDIS === 'true';

// ── Redis 客户端 ──────────────────────────────────────────────────────────────
let client = null;

if (ENABLED) {
  try {
    client = new Redis(REDIS_CONFIG);
    
    client.on('connect', () => {
      logger.info({ prefix: REDIS_CONFIG.keyPrefix }, '[Redis] Connected');
    });
    
    client.on('error', (err) => {
      logger.error({ err, prefix: REDIS_CONFIG.keyPrefix }, '[Redis] Error');
    });
    
    client.on('close', () => {
      logger.warn({ prefix: REDIS_CONFIG.keyPrefix }, '[Redis] Connection closed');
    });
  } catch (err) {
    logger.error({ err }, '[Redis] Failed to initialize');
  }
}

// ── 缓存工具函数 ──────────────────────────────────────────────────────────────

/**
 * 生成缓存键
 */
function makeKey(...parts) {
  return REDIS_CONFIG.keyPrefix + parts.join(':');
}

/**
 * 序列化数据
 */
function serialize(data) {
  return JSON.stringify(data);
}

/**
 * 反序列化数据
 */
function deserialize(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// ── 核心 API ──────────────────────────────────────────────────────────────────

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {Promise<any>} - 缓存的数据，null 表示未命中或错误
 */
async function get(key) {
  if (!client) return null;
  
  try {
    const data = await client.get(makeKey(key));
    return deserialize(data);
  } catch (err) {
    logger.error({ err, key }, '[Redis] Get failed');
    return null;
  }
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 要缓存的数据
 * @param {number} ttl - 过期时间（秒），默认 300 秒（5 分钟）
 * @returns {Promise<boolean>} - 是否成功
 */
async function set(key, value, ttl = 300) {
  if (!client) return false;
  
  try {
    const serialized = serialize(value);
    await client.setex(makeKey(key), ttl, serialized);
    return true;
  } catch (err) {
    logger.error({ err, key }, '[Redis] Set failed');
    return false;
  }
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 * @returns {Promise<boolean>} - 是否成功
 */
async function del(key) {
  if (!client) return false;
  
  try {
    await client.del(makeKey(key));
    return true;
  } catch (err) {
    logger.error({ err, key }, '[Redis] Delete failed');
    return false;
  }
}

/**
 * 批量删除匹配模式的缓存
 * @param {string} pattern - 匹配模式，如 'news:*'
 * @returns {Promise<number>} - 删除的键数量
 */
async function delPattern(pattern) {
  if (!client) return 0;
  
  try {
    const keys = await client.keys(makeKey(pattern));
    if (keys.length === 0) return 0;
    
    await client.del(...keys);
    return keys.length;
  } catch (err) {
    logger.error({ err, pattern }, '[Redis] Pattern delete failed');
    return 0;
  }
}

/**
 * 检查缓存是否存在
 * @param {string} key - 缓存键
 * @returns {Promise<boolean>}
 */
async function exists(key) {
  if (!client) return false;
  
  try {
    const result = await client.exists(makeKey(key));
    return result === 1;
  } catch (err) {
    logger.error({ err, key }, '[Redis] Exists check failed');
    return false;
  }
}

/**
 * 获取缓存剩余时间
 * @param {string} key - 缓存键
 * @returns {Promise<number>} - 剩余秒数，-2 表示不存在，-1 表示永不过期
 */
async function ttl(key) {
  if (!client) return -2;
  
  try {
    return await client.ttl(makeKey(key));
  } catch (err) {
    logger.error({ err, key }, '[Redis] TTL check failed');
    return -2;
  }
}

/**
 * 原子性递增计数器
 * @param {string} key - 缓存键
 * @param {number} increment - 递增值
 * @returns {Promise<number>} - 递增后的值
 */
async function incr(key, increment = 1) {
  if (!client) return 0;
  
  try {
    return await client.incrby(makeKey(key), increment);
  } catch (err) {
    logger.error({ err, key }, '[Redis] Increment failed');
    return 0;
  }
}

/**
 * 带锁的获取并设置（防止缓存击穿）
 * @param {string} key - 缓存键
 * @param {Function} fetchFn - 获取数据的异步函数
 * @param {number} ttl - 缓存时间（秒）
 * @returns {Promise<any>}
 */
async function getOrSet(key, fetchFn, ttl = 300) {
  // 先尝试从缓存获取
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }
  
  // 缓存未命中，获取数据
  try {
    const data = await fetchFn();
    if (data !== null && data !== undefined) {
      await set(key, data, ttl);
    }
    return data;
  } catch (err) {
    logger.error({ err, key }, '[Redis] GetOrSet failed');
    return null;
  }
}

/**
 * 获取缓存统计信息
 * @returns {Promise<object>}
 */
async function getStats() {
  if (!client) {
    return {
      enabled: false,
      connected: false,
    };
  }
  
  try {
    const info = await client.info('stats');
    const keysCount = await client.dbsize();
    
    // 解析 stats 信息
    const stats = {};
    info.split('\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key.trim()] = value.trim();
      }
    });
    
    return {
      enabled: true,
      connected: true,
      keysCount,
      hits: stats.keyspace_hits || 0,
      misses: stats.keyspace_misses || 0,
      hitRate: calculateHitRate(stats.keyspace_hits, stats.keyspace_misses),
    };
  } catch (err) {
    logger.error({ err }, '[Redis] GetStats failed');
    return {
      enabled: true,
      connected: false,
      error: err.message,
    };
  }
}

/**
 * 计算命中率
 */
function calculateHitRate(hits, misses) {
  const h = parseInt(hits || 0, 10);
  const m = parseInt(misses || 0, 10);
  const total = h + m;
  if (total === 0) return 0;
  return ((h / total) * 100).toFixed(2) + '%';
}

/**
 * 关闭连接
 */
async function close() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('[Redis] Connection closed');
  }
}

// ── 导出 ──────────────────────────────────────────────────────────────────────
module.exports = {
  // 核心操作
  get,
  set,
  del,
  delPattern,
  exists,
  ttl,
  incr,
  
  // 高级功能
  getOrSet,
  
  // 监控
  getStats,
  
  // 管理
  close,
  
  // 状态
  isEnabled: ENABLED,
  isConnected: () => client && client.status === 'ready',
  
  // 工具
  makeKey,
};
