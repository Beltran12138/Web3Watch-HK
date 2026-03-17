-- Supabase RPC Functions for Alpha Radar
-- 这些函数用于在数据库服务端进行统计计算，减少网络传输
-- 
-- 使用方法：
-- 1. 在 Supabase Dashboard -> SQL Editor 中执行此脚本
-- 2. 或者使用 psql 连接后执行
--
-- 文档：https://supabase.com/docs/guides/database/functions

-- ── 启用必要的扩展 ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 获取分类统计 ──────────────────────────────────────────────────────────────
-- 用途：按业务分类统计新闻数量（支持时间范围过滤）
DROP FUNCTION IF EXISTS get_category_stats(bigint);
CREATE OR REPLACE FUNCTION get_category_stats(since_ts BIGINT DEFAULT 0)
RETURNS TABLE(business_category TEXT, n BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(n.business_category, 'uncategorized')::TEXT AS business_category,
    COUNT(*)::BIGINT AS n
  FROM news n
  WHERE 
    (since_ts = 0 OR n.timestamp >= since_ts)
    AND n.business_category != ''
    AND n.business_category IS NOT NULL
  GROUP BY n.business_category
  ORDER BY n DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_category_stats IS '按业务分类统计新闻数量，支持时间范围过滤';

-- ── 获取数据源统计 ────────────────────────────────────────────────────────────
-- 用途：按数据源统计新闻数量
DROP FUNCTION IF EXISTS get_source_stats();
CREATE OR REPLACE FUNCTION get_source_stats()
RETURNS TABLE(source TEXT, n BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.source::TEXT,
    COUNT(*)::BIGINT AS n
  FROM news n
  GROUP BY n.source
  ORDER BY n DESC
  LIMIT 30;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_source_stats IS '按数据源统计新闻数量，返回前 30 个';

-- ── 获取每日统计 ──────────────────────────────────────────────────────────────
-- 用途：按日期统计新闻数量（用于趋势图）
DROP FUNCTION IF EXISTS get_daily_stats(integer);
CREATE OR REPLACE FUNCTION get_daily_stats(days INTEGER DEFAULT 7)
RETURNS TABLE(date TEXT, total BIGINT, important BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TO_TIMESTAMP(n.timestamp / 1000)::DATE::TEXT AS date,
    COUNT(*)::BIGINT AS total,
    SUM(CASE WHEN n.is_important = 1 THEN 1 ELSE 0 END)::BIGINT AS important
  FROM news n
  WHERE n.timestamp >= (EXTRACT(EPOCH FROM NOW()) * 1000 - (days * 24 * 3600 * 1000))
  GROUP BY TO_TIMESTAMP(n.timestamp / 1000)::DATE
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_daily_stats IS '按日期统计新闻数量，用于趋势分析';

-- ── 获取 Alpha 分数分布 ───────────────────────────────────────────────────────
-- 用途：统计不同 Alpha 分数段的新闻数量
DROP FUNCTION IF EXISTS get_alpha_score_distribution();
CREATE OR REPLACE FUNCTION get_alpha_score_distribution()
RETURNS TABLE(score_range TEXT, n BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN n.alpha_score = 0 THEN '0'
      WHEN n.alpha_score BETWEEN 1 AND 3 THEN '1-3'
      WHEN n.alpha_score BETWEEN 4 AND 6 THEN '4-6'
      WHEN n.alpha_score BETWEEN 7 AND 8 THEN '7-8'
      WHEN n.alpha_score >= 9 THEN '9-10'
      ELSE 'unknown'
    END::TEXT AS score_range,
    COUNT(*)::BIGINT AS n
  FROM news n
  GROUP BY 
    CASE 
      WHEN n.alpha_score = 0 THEN '0'
      WHEN n.alpha_score BETWEEN 1 AND 3 THEN '1-3'
      WHEN n.alpha_score BETWEEN 4 AND 6 THEN '4-6'
      WHEN n.alpha_score BETWEEN 7 AND 8 THEN '7-8'
      WHEN n.alpha_score >= 9 THEN '9-10'
      ELSE 'unknown'
    END
  ORDER BY n.alpha_score;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_alpha_score_distribution IS '统计 Alpha 分数分布';

-- ── 清理重复数据 ──────────────────────────────────────────────────────────────
-- 用途：删除完全重复的新闻记录（保留 ID 最小的）
CREATE OR REPLACE FUNCTION cleanup_duplicate_news()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY title, source 
        ORDER BY id
      ) as rn
    FROM news
  )
  DELETE FROM news
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION cleanup_duplicate_news IS '删除重复新闻记录，返回删除数量';

-- ── 归档旧数据 ────────────────────────────────────────────────────────────────
-- 用途：将超过指定天数的新闻移动到归档表
DROP FUNCTION IF EXISTS archive_old_news(integer);
CREATE OR REPLACE FUNCTION archive_old_news(older_than_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
  cutoff_timestamp BIGINT;
BEGIN
  -- 计算截止时间戳
  cutoff_timestamp := EXTRACT(EPOCH FROM (NOW() - (older_than_days || ' days')::INTERVAL)) * 1000;
  
  -- 插入到归档表
  INSERT INTO news_archive (
    title, normalized_title, content, detail, impact, bitv_action,
    source, url, category, business_category, competitor_category,
    timestamp, is_important, alpha_score, sent_to_wecom, created_at
  )
  SELECT 
    title, normalized_title, content, detail, impact, bitv_action,
    source, url, category, business_category, competitor_category,
    timestamp, is_important, alpha_score, sent_to_wecom, created_at
  FROM news
  WHERE timestamp < cutoff_timestamp;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  -- 从主表删除
  DELETE FROM news WHERE timestamp < cutoff_timestamp;
  
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION archive_old_news IS '归档旧新闻数据，返回归档数量';

-- ── 获取数据库健康状态 ───────────────────────────────────────────────────────
-- 用途：检查数据库整体健康状况
DROP FUNCTION IF EXISTS get_database_health();
CREATE OR REPLACE FUNCTION get_database_health()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_records', (SELECT COUNT(*) FROM news),
    'important_count', (SELECT COUNT(*) FROM news WHERE is_important = 1),
    'sources_count', (SELECT COUNT(DISTINCT source) FROM news),
    'oldest_record', (SELECT MIN(timestamp) FROM news),
    'newest_record', (SELECT MAX(timestamp) FROM news),
    'avg_alpha_score', (SELECT ROUND(AVG(alpha_score), 2) FROM news WHERE alpha_score > 0),
    'categories_with_data', (SELECT COUNT(DISTINCT business_category) FROM news WHERE business_category != ''),
    'last_24h_count', (
      SELECT COUNT(*) FROM news 
      WHERE timestamp >= (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_database_health IS '获取数据库健康状态报告';

-- ── 权限设置 ──────────────────────────────────────────────────────────────────
-- 确保 authenticated 用户可以执行这些函数
GRANT EXECUTE ON FUNCTION get_category_stats(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION get_source_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_alpha_score_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_duplicate_news() TO authenticated;
GRANT EXECUTE ON FUNCTION archive_old_news(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_health() TO authenticated;

-- ── 验证安装 ──────────────────────────────────────────────────────────────────
-- 执行以下查询验证函数是否正确安装：
-- SELECT routine_name FROM information_schema.routines 
-- WHERE routine_schema = 'public' 
-- AND routine_name LIKE 'get_%';
