'use strict';
/**
 * filter.js — 统一数据清洗模块（增强版）
 *
 * 职责：
 *   1. 过滤垃圾 URL（微博分享等）
 *   2. 过滤垃圾标题（精确匹配 / 正则）
 *   3. URL 去重 + 标题相似度去重 + 内容指纹去重
 *   4. 源级别时间戳验证
 *   5. 提供 isReportNoise() 用于日报/周报二次过滤
 */

const {
  JUNK_URL_PATTERNS,
  JUNK_TITLE_EXACT,
  MIN_TITLE_LENGTH,
  REPORT_NOISE_SOURCES,
  REPORT_NOISE_TITLE_KEYWORDS,
  SOURCE_CONFIGS,
  DEFAULT_SOURCE_CONFIG,
} = require('./config');
const { contentFingerprint } = require('./db');

// ── 额外的噪声正则（补充 config 中的关键词列表）────────────────────────────
const JUNK_TITLE_REGEXES = [
  /^微信扫码/,
  /^#\S+$/,                               // 纯 hashtag
  /^(置顶|公告|活动)$/,
  /share\.php/i,                          // URL 混入标题
];

// 微博分享链接的特征（URL 层面）
const WEIBO_SHARE_PATTERN = /service\.weibo\.com|weibo\.com\/share|share\.php/i;

/**
 * 获取某消息源的配置（带默认值）
 */
function getSourceConfig(source) {
  return SOURCE_CONFIGS[source] || DEFAULT_SOURCE_CONFIG;
}

/**
 * 源级别时间戳验证
 * @param {Object} item - 新闻条目
 * @returns {boolean} - 是否通过验证（true=有效，false=应丢弃）
 */
function validateTimestamp(item) {
  const source = item.source || 'Unknown';
  const config = getSourceConfig(source);
  
  // 没有时间戳的处理
  if (!item.timestamp || isNaN(item.timestamp)) {
    if (config.enableStrictTimestamp) {
      return false; // 严格模式：直接丢弃
    }
    // 非严格模式：赋予当前时间但标记为低优先级
    item.timestamp = Date.now();
    return true;
  }
  
  // 检查消息年龄
  const ageMs = Date.now() - item.timestamp;
  const maxAgeMs = config.maxAgeHours * 60 * 60 * 1000;
  
  if (ageMs > maxAgeMs) {
    console.log(`  [SKIP] ${source}: 消息过旧 (${Math.floor(ageMs / (60*60*1000))}h > ${config.maxAgeHours}h): ${item.title?.substring(0, 40)}`);
    return false;
  }
  
  // 检查未来时间（容错 5 分钟）
  if (item.timestamp > Date.now() + 5 * 60 * 1000) {
    console.log(`  [SKIP] ${source}: 未来时间戳：${item.title?.substring(0, 40)}`);
    return false;
  }
  
  return true;
}

/**
 * 生成去重用复合键（URL+ 标题 + 内容指纹）
 */
function dedupKeyWithTitle(title) {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-_,.:;!?()\[\]{}"'\\/|@#$%^&*+=<>~`]+/g, '')
    .replace(/[\s\-_,.:;!?()\[\]{}"'\\/|@#$%^&*+=<>~`]+$/g, '');
}

/**
 * 生成完整去重键（用于 strict 模式）
 */
function fullDedupKey(item) {
  const titleKey = dedupKeyWithTitle(item.title);
  const fp = contentFingerprint(item.content);
  return `${titleKey}|${fp}`;
}

/**
 * 两个标题是否足够相似（视为重复）
 */
function isSimilarTitle(t1, t2) {
  const k1 = dedupKeyWithTitle(t1);
  const k2 = dedupKeyWithTitle(t2);
  if (k1 === k2) return true;
  if (Math.abs(k1.length - k2.length) > 10) return false;
  if (k1.length > 20 && k2.includes(k1)) return true;
  if (k2.length > 20 && k1.includes(k2)) return true;
  return false;
}

/**
 * 判断单条新闻是否为垃圾数据
 */
function isJunkItem(item) {
  const title = (item.title || '').trim();
  const url   = (item.url   || '').trim();

  // 1. URL 是微博分享链接
  if (WEIBO_SHARE_PATTERN.test(url)) return true;

  // 2. URL 匹配其他垃圾模式
  if (JUNK_URL_PATTERNS.some(p => url.includes(p))) return true;

  // 3. 标题精确匹配垃圾列表
  if (JUNK_TITLE_EXACT.some(junk => title === junk || title.startsWith(junk))) return true;

  // 4. 标题正则匹配
  if (JUNK_TITLE_REGEXES.some(re => re.test(title))) return true;

  // 5. 标题过短
  if (title.length < MIN_TITLE_LENGTH) return true;

  return false;
}

/**
 * 判断条目是否属于"报告噪声"（不应进入日报/周报精选，但仍存入数据库）
 *
 * 与 isJunkItem 的区别：
 *   - isJunkItem  → 彻底丢弃，不存库
 *   - isReportNoise → 存库，但报告阶段跳过
 */
function isReportNoise(item) {
  const title      = (item.title  || '').toLowerCase();
  const source     = (item.source || '');

  // 来源黑名单
  if (REPORT_NOISE_SOURCES.has(source)) return true;

  // 标题关键词
  if (REPORT_NOISE_TITLE_KEYWORDS.some(kw => title.includes(kw.toLowerCase()))) return true;

  return false;
}

/**
 * 过滤 + 去重新闻列表（抓取阶段调用）
 * 新增功能：
 * - 源级别时间戳验证
 * - 内容指纹去重（strict 模式）
 * - URL 规范化去重
 */
function filterNewsItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Map(); // title -> source (用于跨源去重)
  const seenFullKeys = new Set(); // strict 模式使用
  
  return items.filter(item => {
    // 1. 基础垃圾过滤
    if (isJunkItem(item)) return false;
    
    // 2. 源级别时间戳验证
    if (!validateTimestamp(item)) return false;
    
    const title = (item.title || '').trim();
    const url = (item.url || '').trim();
    const source = (item.source || '').trim();
    const config = getSourceConfig(source);
    
    // 3. URL 去重（去掉查询参数和锚点）
    if (url) {
      const normalizedUrl = url.replace(/[?#].*$/, '');
      if (seenUrls.has(normalizedUrl)) {
        console.log(`  [DUP URL] ${source}: ${title.substring(0, 40)}`);
        return false;
      }
      seenUrls.add(normalizedUrl);
    }
    
    // 4. 根据 dedupMode 进行不同级别的去重
    if (config.dedupMode === 'strict') {
      // Strict 模式：URL+ 标题归一化 + 内容指纹三重验证
      const fullKey = fullDedupKey(item);
      if (seenFullKeys.has(fullKey)) {
        console.log(`  [DUP STRICT] ${source}: ${title.substring(0, 40)}`);
        return false;
      }
      seenFullKeys.add(fullKey);
      
      // 额外检查：同一标题不同来源（防止跨源重复）
      const titleKey = dedupKeyWithTitle(title);
      if (seenTitles.has(titleKey)) {
        const existingSource = seenTitles.get(titleKey);
        if (existingSource !== source) {
          // 跨源重复，但保留（可能是同一消息的不同报道）
          // 只记录不过滤
        }
      }
      seenTitles.set(titleKey, source);
      
    } else if (config.dedupMode === 'normal') {
      // Normal 模式：URL+ 标题相似度
      for (const [seenTitle, seenSource] of seenTitles.entries()) {
        if (isSimilarTitle(title, seenTitle)) {
          console.log(`  [DUP TITLE] ${source}: ${title.substring(0, 40)}`);
          return false;
        }
      }
      seenTitles.set(dedupKeyWithTitle(title), source);
      
    } else {
      // Loose 模式：仅 URL 去重（已在上面处理）
      seenTitles.set(dedupKeyWithTitle(title), source);
    }
    
    return true;
  });
}

module.exports = { 
  isJunkItem, 
  isReportNoise, 
  filterNewsItems, 
  validateTimestamp,
  getSourceConfig,
  fullDedupKey,
};
