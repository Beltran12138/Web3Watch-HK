'use strict';
/**
 * filter.js — 统一数据清洗模块（增强版）
 *
 * 职责：
 *   1. 过滤垃圾 URL（微博分享等）
 *   2. 过滤垃圾标题（精确匹配 / 正则）
 *   3. URL 去重 + 标题相似度去重
 *   4. 提供 isReportNoise() 用于日报/周报二次过滤
 */

const {
  JUNK_URL_PATTERNS,
  JUNK_TITLE_EXACT,
  MIN_TITLE_LENGTH,
  REPORT_NOISE_SOURCES,
  REPORT_NOISE_TITLE_KEYWORDS,
} = require('./config');

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
 * 生成标题去重 key（保留中英文数字，去除空白和标点）
 */
function dedupKey(title) {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:]+/, '')
    .replace(/[\s\-:]+$/, '');
}

/**
 * 两个标题是否足够相似（视为重复）
 */
function isSimilarTitle(t1, t2) {
  const k1 = dedupKey(t1);
  const k2 = dedupKey(t2);
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
 */
function filterNewsItems(items) {
  const seenUrls   = new Set();
  const seenTitles = [];

  return items.filter(item => {
    if (isJunkItem(item)) return false;

    const title = (item.title || '').trim();
    const url   = (item.url   || '').trim();

    // URL 去重（去掉查询参数和锚点）
    if (url) {
      const normalizedUrl = url.replace(/[?#].*$/, '');
      if (seenUrls.has(normalizedUrl)) return false;
      seenUrls.add(normalizedUrl);
    }

    // 标题相似度去重
    for (const seen of seenTitles) {
      if (isSimilarTitle(title, seen)) return false;
    }
    seenTitles.push(title);

    return true;
  });
}

module.exports = { isJunkItem, isReportNoise, filterNewsItems };
