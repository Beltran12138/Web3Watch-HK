#!/usr/bin/env node
'use strict';
/**
 * clean-database.js - 数据库清洗脚本
 * 
 * 功能：
 * 1. 清理标题和内容中的乱码字符
 * 2. 修复时间戳为 null 的记录
 * 3. 规范化业务分类字段
 * 4. 生成清洗报告
 * 
 * 使用方法：
 *   node clean-database.js [--dry-run]
 * 
 * 参数：
 *   --dry-run: 仅预览不实际修改
 */

const path = require('path');
const Database = require('better-sqlite3');
const { cleanChineseText } = require('./db');

// ── 配置 ──────────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'alpha_radar.db');
const DRY_RUN = process.argv.includes('--dry-run');

console.log('=== Alpha Radar 数据库清洗脚本 ===\n');
console.log(`数据库路径：${DB_PATH}`);
console.log(`运行模式：${DRY_RUN ? '🔍 预览模式（不修改）' : '🔧 实际执行'}\n`);

// ── 初始化数据库 ──────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── 统计信息 ──────────────────────────────────────────────────────────────────
const stats = {
  totalRecords: 0,
  cleanedTitles: 0,
  cleanedContents: 0,
  fixedTimestamps: 0,
  normalizedCategories: 0,
  errors: [],
};

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 检测文本是否包含乱码（更严格的检测）
 */
function hasMojibake(text) {
  if (!text) return false;
  
  // 只检测明确的乱码特征，避免误判正常中文
  const mojibakePatterns = [
    /[\uFFFD]{1,}/,              // Unicode 替换字符 () - 这是最明确的乱码标志
    /[\u0080-\u00FF]{5,}/,       // 连续 5 个以上高位拉丁字母（可能是双编码）
    /[]/,                        // 另一种替换字符表示
  ];
  
  return mojibakePatterns.some(pattern => pattern.test(text));
}

/**
 * 规范化业务分类
 */
function normalizeCategory(category) {
  if (!category || category.trim() === '') return '';
  
  const cat = category.trim();
  
  // 常见分类映射表
  const categoryMap = {
    '融资/投资': '融资/投资',
    '融资/投資': '融资/投资',
    '交易所/产品': '交易所/产品',
    '交易所/産品': '交易所/产品',
    '稳定币': '稳定币',
    '穩定幣': '稳定币',
    '监管/政策': '监管/政策',
    '監管/政策': '监管/政策',
  };
  
  return categoryMap[cat] || cat;
}

// ── 清洗步骤 ──────────────────────────────────────────────────────────────────

console.log('📊 分析数据库...\n');

// 1. 获取总记录数
stats.totalRecords = db.prepare('SELECT COUNT(*) as count FROM news').get().count;
console.log(`总记录数：${stats.totalRecords}`);

// 2. 检查需要清洗的数据
console.log('\n🔍 扫描需要清洗的数据...\n');

const checkStmt = db.prepare(`
  SELECT id, title, content, timestamp, business_category
  FROM news
  ORDER BY id DESC
  LIMIT 1000
`);

const records = checkStmt.all();

records.forEach(record => {
  const updates = {};
  
  // 检查标题
  if (hasMojibake(record.title)) {
    updates.title = cleanChineseText(record.title);
    stats.cleanedTitles++;
  }
  
  // 检查内容
  if (record.content && hasMojibake(record.content)) {
    updates.content = cleanChineseText(record.content);
    stats.cleanedContents++;
  }
  
  // 检查时间戳
  if (!record.timestamp || record.timestamp <= 0) {
    updates.timestamp = Date.now();
    stats.fixedTimestamps++;
  }
  
  // 检查业务分类
  if (record.business_category) {
    const normalized = normalizeCategory(record.business_category);
    if (normalized !== record.business_category) {
      updates.business_category = normalized;
      stats.normalizedCategories++;
    }
  }
  
  // 如果有更新，执行更新
  if (Object.keys(updates).length > 0 && !DRY_RUN) {
    try {
      const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), record.id];
      
      db.prepare(`UPDATE news SET ${updateFields} WHERE id = ?`).run(...values);
    } catch (err) {
      stats.errors.push({
        id: record.id,
        error: err.message,
      });
    }
  }
});

// ── 生成报告 ──────────────────────────────────────────────────────────────────

console.log('\n📋 清洗报告:\n');
console.log('┌─────────────────────────────────────┐');
console.log(`│ 总记录数：      ${String(stats.totalRecords).padStart(10)} │`);
console.log(`│ 清理标题：      ${String(stats.cleanedTitles).padStart(10)} │`);
console.log(`│ 清理内容：      ${String(stats.cleanedContents).padStart(10)} │`);
console.log(`│ 修复时间戳：    ${String(stats.fixedTimestamps).padStart(10)} │`);
console.log(`│ 规范化分类：    ${String(stats.normalizedCategories).padStart(10)} │`);
console.log(`│ 错误数：        ${String(stats.errors.length).padStart(10)} │`);
console.log('└─────────────────────────────────────┘\n');

if (stats.errors.length > 0) {
  console.log('⚠️  错误详情:\n');
  stats.errors.slice(0, 10).forEach(err => {
    console.log(`  - ID ${err.id}: ${err.error}`);
  });
  if (stats.errors.length > 10) {
    console.log(`  ... 还有 ${stats.errors.length - 10} 个错误`);
  }
  console.log('');
}

// ── 优化数据库 ────────────────────────────────────────────────────────────────

if (!DRY_RUN) {
  console.log('🔧 优化数据库...\n');
  
  // 清理未使用的空间
  db.exec('VACUUM');
  
  // 分析表以优化查询计划
  db.exec('ANALYZE');
  
  console.log('✓ 数据库优化完成\n');
}

// ── 验证结果 ──────────────────────────────────────────────────────────────────

console.log('✅ 验证清洗结果...\n');

const verifyStmt = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN title LIKE '%[]%' OR title LIKE '%鏁%' THEN 1 ELSE 0 END) as bad_titles,
    SUM(CASE WHEN timestamp IS NULL OR timestamp <= 0 THEN 1 ELSE 0 END) as bad_timestamps
  FROM news
`);

const verify = verifyStmt.get();

console.log(`剩余明显乱码标题：  ${verify.bad_titles || 0}`);
console.log(`无效时间戳：        ${verify.bad_timestamps || 0}\n`);

// ── 关闭数据库 ────────────────────────────────────────────────────────────────

db.close();

console.log('✨ 清洗脚本执行完毕！\n');

if (DRY_RUN) {
  console.log('💡 提示：当前为预览模式，如需实际执行请移除 --dry-run 参数\n');
}

process.exit(stats.errors.length > 0 ? 1 : 0);
