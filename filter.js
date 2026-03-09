/**
 * filter.js — 统一数据清洗模块
 * 用于过滤抓取数据中的垃圾条目（微博分享链接、无效标题等）
 */

// 垃圾 URL 模式
const JUNK_URL_PATTERNS = [
    'service.weibo.com/share/share.php',
    'weibo.com/share',
    'share.php',
    // 注意：不要加 '#m'，nitter 所有推文链接都以 #m 结尾，加了会过滤掉所有 KOL 推文
];

// 垃圾标题关键词（完全匹配或包含即过滤）
const JUNK_TITLE_EXACT = [
    '微信扫码 分享划过弹出',
    '微信扫码',
    '分享划过弹出',
    '置顶',
    '[原文链接]',
    '#Launchpool',
    '#Grid Trading',
    '#Demo Trading',
    '#区块链网络 & 分叉',
    'Gate Charity',
    'Gate Square',
];

// 标题最小长度
const MIN_TITLE_LENGTH = 8;

/**
 * 生成用于去重的标题 key
 * 保留更多字符以提高区分度，避免不同标题被误判为重复
 */
function generateDedupKey(title) {
    return (title || '')
        .trim()
        .toLowerCase()
        // 保留中文、英文、数字，但移除多余空格和标点
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-:]+/, '')
        .replace(/[\s\-:]+$/, '');
}

/**
 * 判断两条标题是否足够相似（可能是重复）
 * 使用更严格的匹配规则
 */
function isSimilarTitle(title1, title2) {
    const key1 = generateDedupKey(title1);
    const key2 = generateDedupKey(title2);

    // 完全相同视为重复
    if (key1 === key2) return true;

    // 如果长度差异太大，不视为重复
    if (Math.abs(key1.length - key2.length) > 10) return false;

    // 检查是否一个是另一个的子串（且长度足够）
    if (key1.length > 20 && key2.includes(key1)) return true;
    if (key2.length > 20 && key1.includes(key2)) return true;

    return false;
}

/**
 * 判断一条新闻是否为垃圾数据
 * @param {Object} item - 新闻条目 {title, url, source, ...}
 * @returns {boolean} true = 应该被过滤掉
 */
function isJunkItem(item) {
    const title = (item.title || '').trim();
    const url = (item.url || '').trim();

    // 1. URL 匹配垃圾模式
    if (JUNK_URL_PATTERNS.some(p => url.includes(p))) return true;

    // 2. 标题完全匹配垃圾列表
    if (JUNK_TITLE_EXACT.some(junk => title === junk || title.startsWith(junk))) return true;

    // 3. 标题过短
    if (title.length < MIN_TITLE_LENGTH) return true;

    // 4. 纯标签类标题（以 # 开头且无实质内容）
    if (/^#\S+$/.test(title)) return true;

    return false;
}

/**
 * 过滤新闻列表，去除垃圾数据并按标题去重
 * @param {Array} items - 新闻条目数组
 * @returns {Array} 清洗后的条目
 */
function filterNewsItems(items) {
    const seenUrls = new Set();
    const seenTitles = [];

    return items.filter(item => {
        if (isJunkItem(item)) return false;

        const title = (item.title || '').trim();
        const url = (item.url || '').trim();

        // 1. URL 去重（最严格的去重）
        if (url) {
            const normalizedUrl = url.replace(/[?#].*$/, ''); // 移除查询参数和锚点
            if (seenUrls.has(normalizedUrl)) {
                return false;
            }
            seenUrls.add(normalizedUrl);
        }

        // 2. 标题相似度去重（更宽松的匹配）
        // 只检查与已保留标题的相似度，不跨源去重
        for (const seenTitle of seenTitles) {
            if (isSimilarTitle(title, seenTitle)) {
                return false;
            }
        }
        seenTitles.push(title);

        return true;
    });
}

module.exports = { isJunkItem, filterNewsItems };
