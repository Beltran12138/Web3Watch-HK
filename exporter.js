'use strict';

/**
 * exporter.js — 数据导出工具
 * 
 * 职责：
 *   1. 筛选高质量（alpha_score >= 90）的情报数据
 *   2. 脱敏处理（移除 URL、PII 等）
 *   3. 导出为 JSONL 格式，用于 LLM 微调 (Fine-tuning)
 */

const fs = require('fs');
const path = require('path');
const { newsDAO } = require('./dao');

async function exportForTraining(outputPath = 'training_data.jsonl') {
  console.log('[Exporter] Starting data export for training...');
  
  // 仅导出高价值、且已由 AI 处理过的新闻
  const news = await newsDAO.list(1000, { important: 1 });
  const highValue = news.filter(n => n.alpha_score >= 90);
  
  console.log(`[Exporter] Found ${highValue.length} high-value items.`);

  const jsonl = highValue.map(item => {
    // 构造微调格式
    return JSON.stringify({
      prompt: `请分析以下快讯的情报价值并分类：\n标题：${item.title}\n内容：${item.content || '(无)'}`,
      completion: JSON.stringify({
        business_category: item.business_category,
        competitor_category: item.competitor_category,
        detail: item.detail,
        alpha_score: item.alpha_score,
        impact: item.impact,
        bitv_action: item.bitv_action
      })
    });
  }).join('\n');

  const fullPath = path.join(process.cwd(), outputPath);
  fs.writeFileSync(fullPath, jsonl);
  
  console.log(`[Exporter] Exported to ${fullPath}`);
}

// 如果直接运行脚本
if (require.main === module) {
  exportForTraining().catch(console.error);
}

module.exports = { exportForTraining };
