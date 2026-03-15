'use strict';

/**
 * monitoring/monitor.js — 情报密度监控器 (Proactive Alerting)
 * 
 * 职责：
 *   1. 监控短时间内（如 30 分钟）跨信源的关键词出现频率
 *   2. 如果密度超过阈值（如 3 个不同来源提到“稳定币新规”），触发高能预警
 *   3. 实时分析情报价值评分 (alpha_score)
 */

const { newsDAO } = require('../dao');
const { pushManager } = require('../push-channel');

class IntelligenceDensityMonitor {
  constructor() {
    this.windowMs = 30 * 60 * 1000; // 30 分钟滑动窗口
    this.threshold = 3;            // 触发阈值：3 个不同来源
  }

  /**
   * 检查最新情报密度并发出预警
   */
  async checkDensity() {
    console.log('[Monitor] Checking intelligence density...');
    
    const since = Date.now() - this.windowMs;
    // 获取最近 30 分钟内的新闻
    const recentNews = await newsDAO.list(50, { since });
    
    if (recentNews.length < this.threshold) return;

    // 关键词提取与跨源统计
    const topicMap = new Map();

    for (const item of recentNews) {
      // 提取核心关键词（可结合 AI 或 简单的分词/正则）
      const keywords = this.extractKeywords(item.title);
      
      for (const kw of keywords) {
        if (!topicMap.has(kw)) {
          topicMap.set(kw, new Set());
        }
        topicMap.get(kw).add(item.source);
      }
    }

    // 评估是否触发预警
    for (const [topic, sources] of topicMap.entries()) {
      if (sources.size >= this.threshold) {
        await this.triggerAlert(topic, Array.from(sources));
      }
    }
  }

  /**
   * 提取标题中的核心实体/关键词
   */
  extractKeywords(title) {
    // 简单实现：使用预定义的敏感词库，或提取名词
    const sensitiveWords = [
      '稳定币', 'RWA', '牌照', '证监会', 'SFC', '处罚', '收购', '上线', '新规'
    ];
    
    return sensitiveWords.filter(word => title.includes(word));
  }

  /**
   * 触发高能预警推送
   */
  async triggerAlert(topic, sources) {
    const title = `🔥 高能预警：发现行业热点 [${topic}]`;
    const content = `> 系统检测到 **${topic}** 在短时间内被 **${sources.length}** 个来源提及。\n\n` +
                    `涉及来源：${sources.join(', ')}\n\n` +
                    `**情报建议：** 请立即关注此动向，可能涉及重大市场变化或合规调整。`;
    
    console.log(`[Monitor] ALERT TRIGGERED: ${topic}`);
    await pushManager.sendImportant(title, content);
  }
}

const monitor = new IntelligenceDensityMonitor();

module.exports = { monitor };
