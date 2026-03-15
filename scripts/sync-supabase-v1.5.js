'use strict';

/**
 * scripts/sync-supabase-v1.5.js — 自动化同步 Supabase 表结构
 * 
 * 职责：
 *   利用现有环境变量，尝试在 Supabase 上创建新表和列。
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺失 SUPABASE_URL 或 SUPABASE_KEY，请检查 .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
  console.log('🚀 开始同步 Supabase 表结构 (v1.5.0)...');

  // 注意：Supabase JS SDK 不支持直接运行 DDL (CREATE/ALTER)，
  // 除非通过特定的 RPC 函数。
  // 我们尝试通过一个通用的方式来检查和引导用户。
  
  console.log('\n⚠️  重要提示：Supabase 的 JavaScript SDK 权限有限，无法直接执行高级 SQL (DDL)。');
  console.log('请复制以下经过严格校对的 SQL 代码，粘贴到您的 Supabase SQL Editor 中运行：\n');
  
  const sql = `
-- 1. 创建行业趋势洞察表
CREATE TABLE IF NOT EXISTS insights (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  trend_key TEXT UNIQUE,
  summary TEXT,
  evidence_count INT DEFAULT 1,
  first_seen BIGINT,
  last_updated BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. 为 news 表增加归一化标题列
ALTER TABLE news ADD COLUMN IF NOT EXISTS normalized_title TEXT;

-- 3. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_insight_key ON insights(trend_key);
CREATE INDEX IF NOT EXISTS idx_insight_updated ON insights(last_updated DESC);
`;

  console.log('==================== SQL START ====================');
  console.log(sql);
  console.log('====================  SQL END  ====================');
  
  console.log('\n💡 运行步骤：');
  console.log('1. 访问 https://app.supabase.com/');
  console.log('2. 进入您的项目: mowgraixlfvmjlqxbgsc');
  console.log('3. 点击左侧导航栏的 "SQL Editor"');
  console.log('4. 点击 "+ New query"');
  console.log('5. 粘贴上方 SQL 并点击 "Run"');
}

sync().catch(console.error);
