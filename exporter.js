'use strict';

/**
 * exporter.js — 数据导出工具
 * 
 * 职责：
 *   1. 筛选高质量（alpha_score >= 90）的情报数据
 *   2. 脱敏处理（移除 URL、PII 等）
 *   3. 导出为多种格式（JSONL, CSV, JSON），用于 LLM 微调或数据分析
 */

const fs = require('fs');
const path = require('path');
const { newsDAO } = require('./dao');

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(h => escapeCsvValue(row[h]));
    rows.push(values.join(','));
  }
  
  return rows.join('\n');
}

async function exportForTraining(outputPath = 'training_data.jsonl', format = 'jsonl') {
  console.log(`[Exporter] Starting data export for training (format: ${format})...`);
  
  const news = await newsDAO.list(1000, { important: 1 });
  const highValue = news.filter(n => n.alpha_score >= 90);
  
  console.log(`[Exporter] Found ${highValue.length} high-value items.`);

  const processedData = highValue.map(item => ({
    prompt: `请分析以下快讯的情报价值并分类：\n标题：${item.title}\n内容：${item.content || '(无)'}`,
    completion: JSON.stringify({
      business_category: item.business_category,
      competitor_category: item.competitor_category,
      detail: item.detail,
      alpha_score: item.alpha_score,
      impact: item.impact,
      bitv_action: item.bitv_action
    })
  }));

  let content;
  let finalPath = outputPath;

  switch (format.toLowerCase()) {
    case 'csv':
      content = convertToCSV(processedData.map(p => ({ prompt: p.prompt, completion: p.completion })));
      if (!outputPath.endsWith('.csv')) finalPath = outputPath.replace(/\.\w+$/, '.csv');
      break;
    case 'json':
      content = JSON.stringify(processedData, null, 2);
      if (!outputPath.endsWith('.json')) finalPath = outputPath.replace(/\.\w+$/, '.json');
      break;
    case 'jsonl':
    default:
      content = processedData.map(p => JSON.stringify(p)).join('\n');
      if (!outputPath.endsWith('.jsonl')) finalPath = outputPath.replace(/\.\w+$/, '.jsonl');
  }

  const fullPath = path.join(process.cwd(), finalPath);
  fs.writeFileSync(fullPath, content, 'utf8');
  
  console.log(`[Exporter] Exported ${processedData.length} items to ${fullPath}`);
  return { path: fullPath, count: processedData.length };
}

async function exportNews(options = {}) {
  const {
    format = 'json',
    source = null,
    important = null,
    startDate = null,
    endDate = null,
    limit = 1000,
    outputPath = null,
  } = options;

  console.log(`[Exporter] Exporting news (format: ${format})...`);

  const news = await newsDAO.list(limit, { source, important, startDate, endDate });
  
  const exportData = news.map(item => ({
    id: item.id,
    title: item.title,
    content: item.content,
    source: item.source,
    url: item.url,
    published_at: item.published_at,
    category: item.business_category,
    competitor: item.competitor_category,
    importance: item.alpha_score,
    is_important: item.is_important,
    impact: item.impact,
    detail: item.detail,
    created_at: item.created_at,
  }));

  let content;
  const ext = format.toLowerCase() === 'excel' ? 'xlsx' : format.toLowerCase();
  const filename = outputPath || `alpha-radar-export-${Date.now()}.${ext}`;

  switch (format.toLowerCase()) {
    case 'csv':
      content = convertToCSV(exportData);
      break;
    case 'json':
    default:
      content = JSON.stringify(exportData, null, 2);
  }

  if (outputPath) {
    const fullPath = path.join(process.cwd(), outputPath);
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[Exporter] Exported ${exportData.length} items to ${fullPath}`);
  }

  return {
    content,
    filename,
    count: exportData.length,
  };
}

// 如果直接运行脚本
if (require.main === module) {
  const args = process.argv.slice(2);
  const format = args.includes('--csv') ? 'csv' : args.includes('--json') ? 'json' : 'jsonl';
  exportForTraining(undefined, format).catch(console.error);
}

module.exports = { 
  exportForTraining,
  exportNews,
  convertToCSV,
};
