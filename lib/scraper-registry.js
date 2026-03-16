'use strict';

/**
 * Scraper 注册表
 * 插件化架构，支持动态注册和管理数据源爬虫
 *
 * 使用方式:
 * const registry = require('./lib/scraper-registry');
 * registry.register('binance', scrapeBinance, { tier: 'high', maxAgeHours: 48 });
 * const scrapers = registry.getByTier('high');
 */

const logger = require('./logger');
const { registry: circuitRegistry } = require('./circuit-breaker');

class ScraperRegistry {
  constructor() {
    this.scrapers = new Map();
  }

  /**
   * 注册一个爬虫
   * @param {string} name - 爬虫名称
   * @param {Function} scraperFn - 爬虫函数
   * @param {Object} config - 配置选项
   * @param {string} config.tier - 'high' | 'low' 抓取频率层级
   * @param {number} config.maxAgeHours - 最大消息年龄（小时）
   * @param {boolean} config.enableStrictTimestamp - 是否启用严格时间戳
   * @param {string} config.dedupMode - 'strict' | 'normal' | 'loose'
   * @param {number} config.pushCooldownHours - 推送冷却时间
   * @param {boolean} config.disabled - 是否禁用
   * @param {Object} config.circuitBreaker - 熔断器配置
   */
  register(name, scraperFn, config = {}) {
    if (typeof scraperFn !== 'function') {
      throw new Error(`Scraper ${name} must be a function`);
    }

    const defaultConfig = {
      tier: 'low',
      maxAgeHours: 48,
      enableStrictTimestamp: false,
      dedupMode: 'normal',
      pushCooldownHours: 24,
      disabled: false,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
      },
    };

    const mergedConfig = { ...defaultConfig, ...config };

    // 创建熔断器
    const breaker = circuitRegistry.get(name, mergedConfig.circuitBreaker);

    this.scrapers.set(name, {
      name,
      fn: scraperFn,
      config: mergedConfig,
      breaker,
      stats: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: null,
        lastError: null,
        avgDuration: 0,
      },
    });

    logger.info({ scraper: name, tier: mergedConfig.tier }, 'Scraper registered');
    return this;
  }

  /**
   * 取消注册爬虫
   */
  unregister(name) {
    const existed = this.scrapers.delete(name);
    if (existed) {
      logger.info({ scraper: name }, 'Scraper unregistered');
    }
    return existed;
  }

  /**
   * 获取爬虫
   */
  get(name) {
    return this.scrapers.get(name);
  }

  /**
   * 获取所有爬虫
   */
  getAll() {
    return Array.from(this.scrapers.values());
  }

  /**
   * 按 tier 获取爬虫
   */
  getByTier(tier) {
    return this.getAll().filter(s => s.config.tier === tier && !s.config.disabled);
  }

  /**
   * 获取启用的爬虫
   */
  getEnabled() {
    return this.getAll().filter(s => !s.config.disabled);
  }

  /**
   * 执行爬虫（带熔断器保护）
   */
  async execute(name, ...args) {
    const scraper = this.scrapers.get(name);
    if (!scraper) {
      throw new Error(`Scraper ${name} not found`);
    }

    if (scraper.config.disabled) {
      throw new Error(`Scraper ${name} is disabled`);
    }

    const startTime = Date.now();
    scraper.stats.totalRuns++;
    scraper.stats.lastRun = new Date().toISOString();

    try {
      const result = await scraper.breaker.execute(() => scraper.fn(...args));
      scraper.stats.successfulRuns++;
      this.updateAvgDuration(scraper, Date.now() - startTime);
      return result;
    } catch (error) {
      scraper.stats.failedRuns++;
      scraper.stats.lastError = error.message;
      throw error;
    }
  }

  /**
   * 批量执行某 tier 的所有爬虫
   */
  async executeByTier(tier, options = {}) {
    const scrapers = this.getByTier(tier);
    const { concurrency = 4, delayMs = 2000 } = options;

    logger.info({ tier, count: scrapers.length }, 'Executing scrapers by tier');

    const results = [];
    const errors = [];

    // 分批执行
    for (let i = 0; i < scrapers.length; i += concurrency) {
      const batch = scrapers.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(s => this.execute(s.name).catch(err => {
          errors.push({ name: s.name, error: err.message });
          return [];
        })),
      );

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(...(Array.isArray(result.value) ? result.value : [result.value]));
        }
      });

      // 批次间延迟
      if (i + concurrency < scrapers.length && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return {
      results,
      errors,
      stats: {
        total: scrapers.length,
        success: scrapers.length - errors.length,
        failed: errors.length,
      },
    };
  }

  /**
   * 禁用/启用爬虫
   */
  setDisabled(name, disabled) {
    const scraper = this.scrapers.get(name);
    if (scraper) {
      scraper.config.disabled = disabled;
      logger.info({ scraper: name, disabled }, 'Scraper disabled state changed');
    }
    return !!scraper;
  }

  /**
   * 获取所有爬虫状态
   */
  getAllStats() {
    const stats = {};
    for (const [name, scraper] of this.scrapers) {
      stats[name] = {
        ...scraper.stats,
        config: {
          tier: scraper.config.tier,
          disabled: scraper.config.disabled,
          maxAgeHours: scraper.config.maxAgeHours,
        },
        circuitBreaker: scraper.breaker.getState(),
      };
    }
    return stats;
  }

  updateAvgDuration(scraper, duration) {
    const { avgDuration, successfulRuns } = scraper.stats;
    // 移动平均
    scraper.stats.avgDuration = (avgDuration * (successfulRuns - 1) + duration) / successfulRuns;
  }
}

// 全局注册表实例
const globalRegistry = new ScraperRegistry();

module.exports = {
  ScraperRegistry,
  registry: globalRegistry,
};
