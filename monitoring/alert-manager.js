'use strict';
/**
 * monitoring/alert-manager.js — Unified error handling & monitoring system
 *
 * Features:
 * - Error aggregation (avoid duplicate alerts)
 * - Scraper failure tracking with threshold-based alerting
 * - AI degradation alerts
 * - Data source health monitoring
 * - Daily summary digest
 */

const EventEmitter = require('events');

class AlertManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      scraperFailThreshold: options.scraperFailThreshold || 3,      // N consecutive failures before alert
      healthCheckIntervalMs: options.healthCheckIntervalMs || 300000, // 5 min
      alertCooldownMs: options.alertCooldownMs || 3600000,           // 1 hour between same alerts
      maxLogEntries: options.maxLogEntries || 1000,
      ...options,
    };

    /** @type {Map<string, { count: number, lastError: string, lastTime: number, consecutive: number }>} */
    this.scraperStatus = new Map();

    /** @type {Map<string, number>} - Alert key -> last alert timestamp */
    this.alertCooldowns = new Map();

    /** @type {Array<{ level: string, category: string, message: string, ts: number, context?: object }>} */
    this.logs = [];

    /** @type {{ current: string, degradedAt: number|null, history: Array }} */
    this.aiProviderState = { current: 'deepseek', degradedAt: null, history: [] };

    /** @type {Map<string, { lastSeen: number, totalCount: number, failCount: number }>} */
    this.sourceHealth = new Map();

    this._pushFn = null;
  }

  /**
   * Register a push function for sending alerts
   * @param {(message: { title: string, content: string }) => Promise<void>} fn
   */
  setPushFunction(fn) {
    this._pushFn = fn;
  }

  // ── Core Logging ──────────────────────────────────────────────────────────

  /**
   * Log an event with level and category
   * @param {'info'|'warn'|'error'|'critical'} level
   * @param {string} category - e.g. 'scraper', 'ai', 'push', 'db'
   * @param {string} message
   * @param {object} [context]
   */
  log(level, category, message, context = null) {
    const entry = { level, category, message, ts: Date.now(), context };
    this.logs.push(entry);

    // Trim log buffer
    if (this.logs.length > this.options.maxLogEntries) {
      this.logs = this.logs.slice(-this.options.maxLogEntries);
    }

    this.emit('log', entry);

    // Auto-escalate critical errors
    if (level === 'critical') {
      this._sendAlert(`[CRITICAL] ${category}`, message, context);
    }
  }

  // ── Scraper Monitoring ────────────────────────────────────────────────────

  /**
   * Record a scraper execution result
   * @param {string} source - Source name
   * @param {boolean} success - Whether scraping succeeded
   * @param {number} itemCount - Number of items scraped
   * @param {string} [error] - Error message if failed
   */
  recordScraperResult(source, success, itemCount = 0, error = null) {
    const existing = this.scraperStatus.get(source) || {
      count: 0, lastError: null, lastTime: 0, consecutive: 0,
      totalItems: 0, successCount: 0, failCount: 0,
    };

    existing.count++;
    existing.lastTime = Date.now();

    if (success) {
      existing.consecutive = 0;
      existing.successCount++;
      existing.totalItems += itemCount;
    } else {
      existing.consecutive++;
      existing.failCount++;
      existing.lastError = error;

      this.log('warn', 'scraper', `${source} failed (consecutive: ${existing.consecutive}): ${error}`);

      if (existing.consecutive >= this.options.scraperFailThreshold) {
        this.log('error', 'scraper', `${source} has failed ${existing.consecutive} times consecutively`);
        this._sendAlert(
          `Scraper Alert: ${source}`,
          `${source} 连续失败 ${existing.consecutive} 次\n最近错误: ${error}`,
          { source, consecutive: existing.consecutive }
        );
      }
    }

    this.scraperStatus.set(source, existing);
    this.emit('scraper-result', { source, success, itemCount, error });
  }

  // ── AI Provider Monitoring ────────────────────────────────────────────────

  /**
   * Record AI provider degradation event
   * @param {string} from - Provider that failed
   * @param {string} to - Provider switched to
   * @param {string} [reason] - Reason for degradation
   */
  recordAIDegradation(from, to, reason = '') {
    this.aiProviderState.current = to;
    this.aiProviderState.degradedAt = Date.now();
    this.aiProviderState.history.push({ from, to, reason, ts: Date.now() });

    // Keep history manageable
    if (this.aiProviderState.history.length > 100) {
      this.aiProviderState.history = this.aiProviderState.history.slice(-100);
    }

    this.log('warn', 'ai', `AI provider degraded: ${from} → ${to} (${reason})`);

    if (to === 'rule_engine') {
      this._sendAlert(
        'AI Service Degradation',
        `AI 服务已完全降级至规则引擎\n原因: ${reason}\n原提供商: ${from}`,
        { from, to, reason }
      );
    }

    this.emit('ai-degradation', { from, to, reason });
  }

  /**
   * Record AI provider recovery
   * @param {string} provider
   */
  recordAIRecovery(provider) {
    this.aiProviderState.current = provider;
    this.aiProviderState.degradedAt = null;
    this.log('info', 'ai', `AI provider recovered: ${provider}`);
    this.emit('ai-recovery', { provider });
  }

  // ── Source Health ──────────────────────────────────────────────────────────

  /**
   * Update source health tracking
   * @param {string} source
   * @param {number} itemCount
   */
  updateSourceHealth(source, itemCount) {
    const existing = this.sourceHealth.get(source) || {
      lastSeen: 0, totalCount: 0, failCount: 0,
    };

    existing.lastSeen = Date.now();
    existing.totalCount += itemCount;
    this.sourceHealth.set(source, existing);
  }

  /**
   * Check source health and alert for stale sources
   * @param {number} staleThresholdMs - Time without data before considered stale (default 4h)
   * @returns {Array<{ source: string, hoursSinceUpdate: number }>}
   */
  checkStaleSources(staleThresholdMs = 4 * 3600000) {
    const staleSources = [];
    const now = Date.now();

    for (const [source, health] of this.sourceHealth) {
      if (health.lastSeen > 0 && (now - health.lastSeen) > staleThresholdMs) {
        const hours = Math.floor((now - health.lastSeen) / 3600000);
        staleSources.push({ source, hoursSinceUpdate: hours });
      }
    }

    if (staleSources.length > 0) {
      const staleList = staleSources.map(s => `${s.source}: ${s.hoursSinceUpdate}h`).join('\n');
      this.log('warn', 'health', `${staleSources.length} stale sources detected:\n${staleList}`);
    }

    return staleSources;
  }

  // ── Push Cost Monitoring ──────────────────────────────────────────────────

  /**
   * Record AI cost and check budget
   * @param {number} costUSD
   * @param {number} budgetUSD
   */
  recordAICost(costUSD, budgetUSD) {
    const percent = (costUSD / budgetUSD * 100).toFixed(1);

    if (costUSD >= budgetUSD * 0.8) {
      this.log('warn', 'cost', `AI cost ${percent}% of daily budget ($${costUSD.toFixed(4)}/$${budgetUSD})`);
    }

    if (costUSD >= budgetUSD) {
      this._sendAlert(
        'AI Budget Exceeded',
        `AI 每日预算已超出: $${costUSD.toFixed(4)} / $${budgetUSD}`,
        { costUSD, budgetUSD }
      );
    }
  }

  // ── Alert Delivery ────────────────────────────────────────────────────────

  /**
   * Send an alert (with cooldown dedup)
   * @private
   */
  async _sendAlert(title, content, context = null) {
    const key = `${title}`;
    const now = Date.now();
    const lastAlert = this.alertCooldowns.get(key) || 0;

    if (now - lastAlert < this.options.alertCooldownMs) {
      return; // Still in cooldown
    }

    this.alertCooldowns.set(key, now);

    const message = {
      title: `🚨 ${title}`,
      content: `${content}\n\n时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      type: 'markdown',
    };

    if (this._pushFn) {
      try {
        await this._pushFn(message);
      } catch (err) {
        console.error('[AlertManager] Failed to send alert:', err.message);
      }
    }

    this.emit('alert', { title, content, context });
  }

  // ── Status & Reporting ────────────────────────────────────────────────────

  /**
   * Get full system status
   */
  getStatus() {
    const scraperEntries = {};
    for (const [source, status] of this.scraperStatus) {
      scraperEntries[source] = {
        ...status,
        successRate: status.count > 0
          ? ((status.successCount / status.count) * 100).toFixed(1) + '%'
          : 'N/A',
      };
    }

    return {
      scrapers: scraperEntries,
      ai: this.aiProviderState,
      sourceHealth: Object.fromEntries(this.sourceHealth),
      recentErrors: this.logs
        .filter(l => l.level === 'error' || l.level === 'critical')
        .slice(-20),
      recentWarnings: this.logs
        .filter(l => l.level === 'warn')
        .slice(-20),
      totalLogs: this.logs.length,
    };
  }

  /**
   * Generate daily monitoring digest
   * @returns {string} Markdown-formatted digest
   */
  generateDigest() {
    const now = Date.now();
    const oneDayAgo = now - 86400000;

    const recentLogs = this.logs.filter(l => l.ts >= oneDayAgo);
    const errors = recentLogs.filter(l => l.level === 'error' || l.level === 'critical');
    const warnings = recentLogs.filter(l => l.level === 'warn');

    // Scraper summary
    const scraperLines = [];
    for (const [source, status] of this.scraperStatus) {
      const rate = status.count > 0 ? ((status.successCount / status.count) * 100).toFixed(0) : 'N/A';
      const indicator = status.consecutive > 0 ? '🔴' : '🟢';
      scraperLines.push(`${indicator} ${source}: ${rate}% (${status.totalItems} items)`);
    }

    let digest = '## 📊 Alpha-Radar 监控日报\n\n';
    digest += `**时间范围**: 最近 24 小时\n`;
    digest += `**错误数**: ${errors.length} | **警告数**: ${warnings.length}\n\n`;

    digest += '### 爬虫状态\n';
    digest += scraperLines.join('\n') + '\n\n';

    digest += `### AI 服务\n`;
    digest += `当前提供商: **${this.aiProviderState.current}**\n`;
    if (this.aiProviderState.degradedAt) {
      const hours = Math.floor((now - this.aiProviderState.degradedAt) / 3600000);
      digest += `⚠️ 已降级 ${hours} 小时\n`;
    }
    digest += '\n';

    if (errors.length > 0) {
      digest += '### 近期错误\n';
      errors.slice(-5).forEach(e => {
        digest += `- [${e.category}] ${e.message}\n`;
      });
    }

    return digest;
  }

  /**
   * Reset all state (for testing)
   */
  reset() {
    this.scraperStatus.clear();
    this.alertCooldowns.clear();
    this.logs = [];
    this.aiProviderState = { current: 'deepseek', degradedAt: null, history: [] };
    this.sourceHealth.clear();
  }
}

// Singleton instance
const alertManager = new AlertManager();

module.exports = { AlertManager, alertManager };
