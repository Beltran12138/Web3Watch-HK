-- ============================================================
-- Alpha-Radar Supabase 表结构修复脚本
-- 
-- 问题：Supabase 数据库缺少关键的去重字段，导致 TechubNews 和 PRNewswire 重复推送
-- 
-- 使用方法：
--   1. 登录 Supabase Dashboard (https://supabase.com/dashboard)
--   2. 选择你的项目
--   3. 进入 SQL Editor
--   4. 复制并执行此脚本
-- ============================================================

-- 1. 添加缺失的列到 news 表
ALTER TABLE news ADD COLUMN IF NOT EXISTS sent_to_wecom INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS normalized_title TEXT DEFAULT '';
ALTER TABLE news ADD COLUMN IF NOT EXISTS alpha_score INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS impact TEXT DEFAULT '';
ALTER TABLE news ADD COLUMN IF NOT EXISTS bitv_action TEXT DEFAULT '';

-- 2. 创建 source_tracking 表（追踪每个源的最后推送时间，用于冷却机制）
CREATE TABLE IF NOT EXISTS source_tracking (
  id SERIAL PRIMARY KEY,
  source TEXT UNIQUE NOT NULL,
  last_pushed_timestamp BIGINT,
  last_pushed_title TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_news_sent_wecom ON news(sent_to_wecom);
CREATE INDEX IF NOT EXISTS idx_news_normalized_title ON news(normalized_title);
CREATE INDEX IF NOT EXISTS idx_news_alpha_score ON news(alpha_score);
CREATE INDEX IF NOT EXISTS idx_source_tracking_source ON source_tracking(source);

-- 4. 为现有记录生成 normalized_title（用于去重）
UPDATE news 
SET normalized_title = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(title, '[\[\(【].*?[\]\)】]', '', 'g'),
      '[^a-zA-Z0-9\u4e00-\u9fff]', '', 'g'),
    '\s+', '', 'g')
  )
WHERE normalized_title = '' OR normalized_title IS NULL;

-- 5. 验证修复结果
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'news'
ORDER BY ordinal_position;
