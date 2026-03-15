/**
 * fix-supabase-schema.js — 自动修复 Supabase 表结构
 * 
 * 问题：Supabase 数据库缺少关键的去重字段，导致 TechubNews 和 PRNewswire 重复推送
 * 
 * 缺失的字段：
 *   - news.sent_to_wecom (标记是否已推送)
 *   - news.normalized_title (用于去重)
 *   - news.alpha_score (重要性评分)
 *   - news.impact (影响评估)
 *   - news.bitv_action (建议行动)
 * 
 * 缺失的表：
 *   - source_tracking (追踪每个源的最后推送时间)
 * 
 * 使用方法：
 *   node fix-supabase-schema.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Supabase 服务角色密钥（需要管理员权限来执行 DDL）
// 如果只有 publishable key，需要手动在 Dashboard 执行 SQL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function fixSchema() {
  console.log('=== Supabase 表结构修复工具 ===\n');

  // 1. 检查当前表结构
  console.log('1. 检查当前 news 表结构...');
  const { data: sampleNews, error: newsError } = await supabase
    .from('news')
    .select('*')
    .limit(1);

  if (newsError) {
    console.error('查询 news 表失败:', newsError.message);
    return;
  }

  const existingCols = sampleNews?.length > 0 ? Object.keys(sampleNews[0]) : [];
  console.log('现有列:', existingCols.join(', '));

  // 2. 检查缺失的列
  const requiredCols = ['sent_to_wecom', 'normalized_title', 'alpha_score', 'impact', 'bitv_action'];
  const missingCols = requiredCols.filter(col => !existingCols.includes(col));

  if (missingCols.length > 0) {
    console.log('\n⚠️  缺失关键列:', missingCols.join(', '));
    console.log('\n这些列对于去重和防止重复推送至关重要！');
  } else {
    console.log('\n✅ news 表结构完整');
  }

  // 3. 检查 source_tracking 表
  console.log('\n2. 检查 source_tracking 表...');
  const { error: trackError } = await supabase
    .from('source_tracking')
    .select('*')
    .limit(1);

  if (trackError) {
    console.log('⚠️  source_tracking 表不存在:', trackError.message);
    console.log('\n这个表用于追踪每个源的最后推送时间，实现冷却机制。');
  } else {
    console.log('✅ source_tracking 表存在');
  }

  // 4. 如果有服务密钥，尝试自动修复
  if (SERVICE_KEY) {
    console.log('\n3. 尝试自动修复...');
    // 使用 RPC 执行 DDL（需要服务密钥）
    // 这里暂时跳过，因为 Supabase JS 客户端不直接支持 DDL
    console.log('(需要手动在 Supabase Dashboard 执行 SQL)');
  }

  // 5. 输出修复 SQL
  console.log('\n=== 请在 Supabase Dashboard 执行以下 SQL ===\n');
  console.log(`-- 1. 添加缺失的列到 news 表
ALTER TABLE news ADD COLUMN IF NOT EXISTS sent_to_wecom INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS normalized_title TEXT DEFAULT '';
ALTER TABLE news ADD COLUMN IF NOT EXISTS alpha_score INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS impact TEXT DEFAULT '';
ALTER TABLE news ADD COLUMN IF NOT EXISTS bitv_action TEXT DEFAULT '';

-- 2. 创建 source_tracking 表
CREATE TABLE IF NOT EXISTS source_tracking (
  id SERIAL PRIMARY KEY,
  source TEXT UNIQUE NOT NULL,
  last_pushed_timestamp BIGINT,
  last_pushed_title TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_news_sent_wecom ON news(sent_to_wecom);
CREATE INDEX IF NOT EXISTS idx_news_normalized_title ON news(normalized_title);
CREATE INDEX IF NOT EXISTS idx_news_alpha_score ON news(alpha_score);

-- 4. 为现有记录生成 normalized_title
UPDATE news 
SET normalized_title = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(title, '[\\[\\(【].*?[\\]\\)】]', '', 'g'),
    '[^a-zA-Z0-9\\u4e00-\\u9fff]', '', 'g')
  )
WHERE normalized_title = '' OR normalized_title IS NULL;
`);

  console.log('\n=== 执行步骤 ===');
  console.log('1. 登录 Supabase Dashboard: https://supabase.com/dashboard');
  console.log('2. 选择你的项目');
  console.log('3. 进入 SQL Editor');
  console.log('4. 复制并执行上面的 SQL');
  console.log('5. 重新运行爬虫测试');
}

fixSchema().catch(console.error);
