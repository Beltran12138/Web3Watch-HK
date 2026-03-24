'use strict';

/**
 * monitoring/monitor.js — 情报密度监控器 (Proactive Alerting)
 *
 * 职责：
 *   1. 监控短时间内（如 30 分钟）跨信源的关键词出现频率
 *   2. 如果密度超过阈值（如 3 个不同来源提到"稳定币新规"），写入 Insights 记忆系统
 *   3. 高密度热点自动写入 Insights 记忆系统
 *   4. 去重：同一关键词 2 小时内不重复告警
 */

const { newsDAO, insightDAO } = require('../dao');

class IntelligenceDensityMonitor {
  constructor() {
    this.windowMs = 30 * 60 * 1000; // 30 分钟滑动窗口
    this.threshold = 3;            // 触发阈值：3 个不同来源
    this.cooldownMs = 2 * 60 * 60 * 1000; // 2 小时冷却
    this._alertHistory = new Map(); // topic -> lastAlertTime
  }

  /**
   * 检查最新情报密度并发出预警
   */
  async checkDensity() {
    console.log('[Monitor] Checking intelligence density...');

    const since = Date.now() - this.windowMs;
    const recentNews = await newsDAO.list(100, { since });

    if (recentNews.length < this.threshold) return;

    // 关键词提取与跨源统计
    const topicMap = new Map(); // keyword -> Set<source>
    const topicItems = new Map(); // keyword -> [items]

    for (const item of recentNews) {
      const keywords = this.extractKeywords(item.title + ' ' + (item.content || ''));

      for (const kw of keywords) {
        if (!topicMap.has(kw)) {
          topicMap.set(kw, new Set());
          topicItems.set(kw, []);
        }
        topicMap.get(kw).add(item.source);
        topicItems.get(kw).push(item);
      }
    }

    // 评估是否触发预警
    for (const [topic, sources] of topicMap.entries()) {
      if (sources.size >= this.threshold) {
        // 去重冷却检查
        const lastAlert = this._alertHistory.get(topic) || 0;
        if (Date.now() - lastAlert < this.cooldownMs) {
          console.log(`[Monitor] Skipping ${topic} (cooldown)`);
          continue;
        }

        this._alertHistory.set(topic, Date.now());
        const items = topicItems.get(topic) || [];
        await this.saveToInsights(topic, Array.from(sources), items);
      }
    }
  }

  /**
   * 提取标题和内容中的核心关键词
   */
  extractKeywords(text) {
    const sensitiveWords = [
      '稳定币', 'RWA', '牌照', '证监会', 'SFC', '处罚', '收购',
      '新规', '合规', '审计', 'VATP', '监管', '冻结', '清退',
      'MiCA', '央行', '比特币', 'Bitcoin', '以太坊', 'Ethereum',
      '合并', '裁员', '破产', '黑客', '漏洞', '制裁',
      'HashKey', 'OSL', 'Gate', 'Binance', 'OKX', 'Bybit',
    ];

    return sensitiveWords.filter(word => text.includes(word));
  }

  /**
   * 将高密度热点写入记忆系统
   */
  async saveToInsights(topic, sources, items) {
    try {
      await insightDAO.saveInsight({
        trend_key: `density:${topic}`,
        summary: `${topic} 在 30 分钟内被 ${sources.length} 个来源（${sources.join(', ')}）提及，涉及 ${items.length} 条快讯`,
        evidence_count: items.length,
        first_seen: Math.min(...items.map(i => i.timestamp || Date.now())),
      });
    } catch (e) {
      console.warn('[Monitor] Failed to save insight:', e.message);
    }
  }
}

const monitor = new IntelligenceDensityMonitor();

module.exports = { monitor };
