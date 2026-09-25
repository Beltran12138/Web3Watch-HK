'use strict';
/**
 * lib/tiering.js — 按内容（非来源）分层
 *
 * A    香港监管/政策 + 重点竞品（HashKey / OSL / EX.IO）→ 全收，推送
 * B    离岸所的产品/业务创新                          → 推送
 * C    其他香港机构动态                               → 仅进日报/周报候选
 * FLASH 安全事件等突发                                → 只递给人工判断，不自动推
 * null 其余
 *
 * 规则全部是确定性的正则，便于用人工周报条目回测（scripts/eval-tiering.js）。
 */

// ── 实体 ─────────────────────────────────────────────────────────────────────
const HK_CORE = /hashkey|\bHSK\b|\bOSL\b|OSL(?=[一-鿿])|\bEX\.?IO\b|EX\.IO/i;
// 「证监会」须排除美国/中国/内地证监会；SFC 须排除美国 SEC 语境
const HK_REGULATOR = new RegExp([
  '(?<![美中国内地])证监会', '(?<![美中國內地])證監會',
  '\\bSFC\\b', '金管局', '金融管理局', '\\bHKMA\\b',
  '财库局', '財庫局', '\\bFSTB\\b', '立法会', '立法會', '施政报告', '施政報告',
  '\\bVATP\\b', '\\bVASP\\b', '稳定币条例', '穩定幣條例', '\\bHKDAP\\b',
].join('|'), 'i');
const HK_CONTEXT = /香港|香港特区|\bHong Kong\b|\bHK\b|港元|港币|港幣|\bHKD\b/i;
// 香港 + 政策性词汇（立法、税务、咨询、表态）
const HK_POLICY = /立法|条例|條例|草案|法案|咨询|諮詢|税|稅|政策|施政|表态|表態|监管|監管|非法|通函|指引|发牌|發牌|框架|CARF|OECD/i;
const NON_HK_REG = /美国证监会|美國證監會|中国证监会|中國證監會|\bSEC\b|\bCFTC\b|\bFCA\b|\bMAS\b|\bESMA\b/i;

const OFFSHORE = /binance|币安|幣安|\bOKX\b|欧易|bybit|bitget|\bgate(\.io|\.com)?\b|芝麻开门|kucoin|库币|\bMEXC\b|抹茶|\bHTX\b|火币|火幣|\bBIT\b|kraken|crypto\.com|deribit|bitmart|bingx|\bWEEX\b|backpack|hyperliquid/i;

// ── 内容信号 ─────────────────────────────────────────────────────────────────
const PRODUCT = new RegExp([
  '股票', '美股', '港股', '日股', '韩股', 'A股', '\\bETFs?\\b', 'rToken', 'xStocks?', 'bStocks?', 'gStocks?',
  '\\bstocks?\\b', 'equit', 'TradFi', '\\bCFD', '期权', 'options?\\b', 'RWA', '代币化', '代幣化', 'tokeni[sz]',
  '理财', '理財', '\\bEarn\\b', '财富管理', 'wealth', 'yield', '收益', '借贷', '借貸', '\\bloan', '融资融券', 'margin',
  '统一账户', '統一帳戶', '\\bUTA\\b', 'unified', '跟单', '跟單', 'copy.?trad', '机器人', '\\bbots?\\b',
  '\\bAI\\b', 'agent', '\\bMCP\\b', '\\bAPIs?\\b', '支付', '\\bPay\\b', 'payments?', '\\bcards?\\b', 'U卡', '钱包', 'wallet',
  '稳定币', '穩定幣', 'stablecoin', '预测市场', 'prediction', 'Odds', '外汇', '\\bFX\\b', 'forex', '黄金', '\\bgold\\b',
  '牌照', 'licen[cs]e', '收购', 'acqui', '合资', 'joint venture', '机构', 'institution', '托管', 'custody',
  '做市', 'market mak', '清算', 'clearing', '券商', 'broker', '统一保证金', 'Quanto', '永续.{0,6}(股|指数|外汇|黄金)',
  '新功能', '全新', '推出', '首发', '首家', 'launch', 'introduc', 'unveil', 'debut', 'expand',
].join('|'), 'i');

// 离岸所日常公告噪音：单币上下架、维护、费率、营销、品牌、排名
const OFFSHORE_NOISE = new RegExp([
  'will list', 'will delist', 'will support the', 'listing', 'delist', '上币', '新币', '下架', '交易对', 'trading pairs?',
  '上线\\s*[A-Z0-9]{2,12}\\s*(\\(|（|\\/|USDT|永续)', '[A-Z0-9]{2,12}USDT', '永续合约全新上线', '倍杠杆',
  '维护', '維護', 'maintenance', 'system upgrade', 'server upgrade', '暂停.{0,6}(充值|提现|充提)', 'suspend.{0,20}(deposit|withdraw)',
  '资金费率', 'funding rate', '爆仓', 'liquidat',
  '空投', 'airdrop', 'launchpool', 'launchpad', 'meme', '奖池', '獎池', 'prize', 'rewards?\\b', 'giveaway', '抽奖', '交易赛',
  'challenge', 'campaign', 'carnival', '嘉年华', '邀请', 'referral', '返佣', '福利', 'bonus', 'hold\\s*&\\s*earn', 'zero-fee',
  'charity', '公益', 'sponsor', '赞助', 'brand', 'award', 'recogni[sz]', '获奖', '榮獲', '荣获', 'ranked', '排名',
  'market share', 'volume (climb|reach|hit|surge)', 'report:', 'research:', 'survey',
  // 单标的上新 / 参数调整
  '上线.{0,40}(股票|指数)合约', '股票上新', '\\badds? \\d+ stocks', 'new stocks on', 'as collateral', 'collateral ratio',
  'margin tiers', 'update on', 'will add', 'captures \\d+%', '分析：', '对话', 'interview', '情报局', '调整通知', '阶梯调整', 'new pairs', '限时享\\s*0\\s*费', 'will launch multiple', 'renamed',
  // 行情评论
  '涨超', '跌超', '涨幅', '跌幅', '收盘', '开盘', '盘前', '盘初', '指数', '收益率', '市值', '巨鲸', '鲸鱼', '浮盈', '净增持', '净减持',
].join('|'), 'i');

// 自媒体/KOL：只保留交易所高管本人
const KOL_SOURCES = new Set(['Phyrex', 'JustinSun', 'TwitterAB', 'WuShuo']);

// 重点竞品/监管同样要滤的纯营销/运维噪音
const CORE_NOISE = /奖池|獎池|prize|rewards?\b|challenge|campaign|交易赛|抽奖|空投|airdrop|邀请|referral|golden autumn|server upgrade|system upgrade|维护|維護|maintenance|活动预告|活动回顾|榮獲|荣获|award/i;

const HK_OTHER_SIGNAL = /券商|证券|證券|银行|銀行|持牌|牌照|RWA|代币化|代幣化|稳定币|穩定幣|基金|资管|資管|ETF|tokeni[sz]|stablecoin|licen[cs]e|\bbank|securities|asset management|数字资产|數字資產|digital asset|虚拟资产|虛擬資產|virtual asset/i;

const SECURITY = /异常转账|異常轉賬|异常转出|被盗|被盜|盗取|黑客|駭客|hack|exploit|stolen|drain|攻击|攻擊|漏洞|安全事件|security (notice|incident)|unauthori[sz]ed transfer/i;

// 黑客松、诉讼/追责类后续不算新的突发
const SECURITY_NOISE = /黑客松|hackathon|起诉|sues|lawsuit|赞助/i;

function textOf(item) {
  return `${item.title || ''} ${item.detail || ''} ${item.content || ''}`.replace(/\s+/g, ' ');
}

/**
 * @param {{title?:string, detail?:string, content?:string, source?:string}} item
 * @returns {{tier: 'A'|'B'|'C'|'FLASH'|null, reason: string}}
 */
function classify(item) {
  const text  = textOf(item);
  const title = (item.title || '').replace(/\s+/g, ' ');

  if (!KOL_SOURCES.has(item.source) && SECURITY.test(title) && !SECURITY_NOISE.test(title)
      && (OFFSHORE.test(title) || HK_CORE.test(title) || HK_CONTEXT.test(title))) {
    return { tier: 'FLASH', reason: 'security' };
  }

  const core = HK_CORE.test(title);
  const reg  = (HK_REGULATOR.test(title) && !(NON_HK_REG.test(title) && !HK_CONTEXT.test(title)))
            || (HK_CONTEXT.test(title) && HK_POLICY.test(title));
  if ((core || reg) && !CORE_NOISE.test(title)) {
    return { tier: 'A', reason: core ? 'hk-core-competitor' : 'hk-regulator' };
  }

  if (!KOL_SOURCES.has(item.source) && OFFSHORE.test(title) && PRODUCT.test(title) && !OFFSHORE_NOISE.test(title)) {
    return { tier: 'B', reason: 'offshore-product' };
  }

  if (HK_CONTEXT.test(text) && HK_OTHER_SIGNAL.test(text) && !CORE_NOISE.test(title)) {
    return { tier: 'C', reason: 'hk-other' };
  }

  return { tier: null, reason: '' };
}

module.exports = { classify };
