'use strict';
/**
 * wiki-context.js — 行研知识库上下文注入器
 *
 * 根据今日新闻条目，智能选取相关的行研 Wiki 页面片段，
 * 注入到 AI 日报提示词中，将"事件摘要"升级为"战略建议"。
 *
 * 架构来源：Karpathy LLM Wiki Pattern
 *   Raw Sources → Wiki → [AI 日报] → 战略建议
 */

const fs   = require('fs');
const path = require('path');

const WIKI_DIR = path.join(__dirname, 'wiki');

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function readWiki(filename) {
  const p = path.join(WIKI_DIR, filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

/** 从 Markdown 文件中提取指定标题下的内容（到下一个同级标题为止） */
function extractSection(content, ...sectionNames) {
  if (!content) return null;
  const lines = content.split('\n');
  let inSection = false;
  let sectionLevel = 0;
  const result = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      const lvl = m[1].length;
      const heading = m[2];
      const matched = sectionNames.some(name => heading.includes(name));
      if (matched) {
        inSection = true;
        sectionLevel = lvl;
        result.push(line);
      } else if (inSection && lvl <= sectionLevel) {
        break; // 同级或更高级新标题，结束
      } else if (inSection) {
        result.push(line);
      }
    } else if (inSection) {
      result.push(line);
    }
  }
  return result.length > 2 ? result.join('\n').trim() : null;
}

/** 截断文本到指定字符数 */
function truncate(str, maxChars = 600) {
  if (!str) return '';
  return str.length <= maxChars ? str : str.slice(0, maxChars) + '…';
}

// ── 来源 → Wiki 页面 映射 ─────────────────────────────────────────────────────

const SOURCE_TO_WIKI = {
  'HashKeyExchange': '竞品-HashKey.md',
  'HashKeyGroup':    '竞品-HashKey.md',
  'TechubNews':      '竞品-HashKey.md',
  'OSL':             '竞品-OSL.md',
  'Exio':            null, // EX.IO 暂无独立 wiki 页
};

// ── 业务分类 → Wiki 页面 映射 ─────────────────────────────────────────────────

const CATEGORY_TO_WIKI = {
  'RWA':    '业务方向-RWA.md',
  '代币化': '业务方向-RWA.md',
  '合规':   '监管-香港SFC.md',
  '监管':   '监管-香港SFC.md',
  '稳定币': '监管-香港SFC.md',
  '牌照':   '监管-香港SFC.md',
  'OTC':    '竞品-HashKey.md',  // OTC 主要竞品是 HashKey
};

// ── 关键词 → Wiki 页面 映射 ─────────────────────────────────────────────────

const KEYWORD_WIKI_RULES = [
  { keywords: ['RWA', '代币化', 'tokeniz'], wiki: '业务方向-RWA.md' },
  { keywords: ['SFC', '证监会', '监管', '牌照', '合规', 'VATP'], wiki: '监管-香港SFC.md' },
  { keywords: ['HashKey', 'hashkey'], wiki: '竞品-HashKey.md' },
  { keywords: ['OSL', 'osl'], wiki: '竞品-OSL.md' },
  { keywords: ['稳定币', 'RLUSD', 'USDGO', 'USDT', 'stablecoin'], wiki: '监管-香港SFC.md' },
  { keywords: ['黄金', 'gold', 'XAUT', 'ETF'], wiki: '业务方向-RWA.md' },
  { keywords: ['AI Agent', 'Skills Hub', 'Gate for AI', 'AI交易'], wiki: '市场趋势.md' },
];

// ── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 根据今日新闻列表，选取相关 Wiki 页面，返回格式化的上下文字符串。
 *
 * @param {Array} newsItems - 今日新闻条目数组
 * @returns {string} 注入到 AI 提示词的上下文块
 */
function getWikiContext(newsItems) {
  if (!newsItems || newsItems.length === 0) return '';

  const wikiFiles = new Set();

  // 始终包含核心战略页
  wikiFiles.add('核心切入机会.md');

  // 根据来源添加竞品页
  newsItems.forEach(item => {
    const wiki = SOURCE_TO_WIKI[item.source];
    if (wiki) wikiFiles.add(wiki);
  });

  // 根据业务分类添加
  newsItems.forEach(item => {
    const cat = item.business_category || '';
    Object.entries(CATEGORY_TO_WIKI).forEach(([key, wiki]) => {
      if (cat.includes(key)) wikiFiles.add(wiki);
    });
  });

  // 根据标题/detail关键词添加
  const allText = newsItems.map(i => `${i.title || ''} ${i.detail || ''}`).join(' ').toLowerCase();
  KEYWORD_WIKI_RULES.forEach(rule => {
    if (rule.keywords.some(kw => allText.includes(kw.toLowerCase()))) {
      wikiFiles.add(rule.wiki);
    }
  });

  // 高 alpha 事件 → 加入趋势页
  const hasHighAlpha = newsItems.some(i => (i.alpha_score || 0) >= 85);
  if (hasHighAlpha) wikiFiles.add('市场趋势.md');

  // 读取并组装上下文
  const blocks = [];

  // 核心战略优先
  const strategy = readWiki('核心切入机会.md');
  if (strategy) {
    blocks.push(`【我司产品优先级（BitV战略背景）】\n${truncate(strategy, 700)}`);
  }
  wikiFiles.delete('核心切入机会.md');

  // 其余页面
  for (const file of wikiFiles) {
    const content = readWiki(file);
    if (!content) continue;

    const pageName = file.replace('.md', '').replace(/-/g, ' ');

    // 优先提取"弱点/我司机会"等关键小节，没有则截断全文
    const focused =
      extractSection(content, '弱点', '我司机会', '切入机会') ||
      extractSection(content, '关键政策', '关键信号') ||
      extractSection(content, '已落地', '竞争格局') ||
      truncate(content, 550);

    blocks.push(`【${pageName}（行研Wiki背景）】\n${focused}`);
  }

  if (blocks.length === 0) return '';

  return (
    '\n\n---\n**⚡ 行研知识库战略背景（来自 Obsidian Wiki，请结合以下背景撰写"对 BitV 的启示"）**\n\n' +
    blocks.join('\n\n') +
    '\n---'
  );
}

module.exports = { getWikiContext };
