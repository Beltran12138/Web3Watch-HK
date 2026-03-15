'use strict';
/**
 * tests/mocks/sample-news.js — Test fixtures for news items
 */

const BASE_TS = Date.now();

const validItem = (overrides = {}) => ({
  title: 'HashKey Exchange 获得 SFC 牌照批准',
  content: 'HashKey Exchange 已通过香港证监会审批...',
  source: 'HashKeyExchange',
  url: `https://hashkey.com/news/${Date.now()}`,
  category: 'Announcement',
  timestamp: BASE_TS - 3600000,
  is_important: 0,
  business_category: '',
  competitor_category: '',
  detail: '',
  alpha_score: 0,
  sent_to_wecom: 0,
  ...overrides,
});

/** Standard test items for filter/dedup tests */
const sampleNews = [
  validItem({ title: 'SFC 发布虚拟资产交易平台新监管指引', source: 'SFC', timestamp: BASE_TS - 1000 }),
  validItem({ title: 'Binance 上线新交易对 BTC/USDT Perpetual', source: 'Binance', url: 'https://binance.com/1' }),
  validItem({ title: 'OKX 获得迪拜 VASP 牌照', source: 'OKX', url: 'https://okx.com/1' }),
  validItem({ title: 'HashKey Group 完成 1 亿美元 B 轮融资', source: 'HashKeyGroup', url: 'https://hashkey.com/1' }),
  validItem({ title: 'OSL 推出机构级数字资产托管服务', source: 'OSL', url: 'https://osl.com/1' }),
  validItem({ title: 'Bybit 上线新币 listing PEPE/USDT', source: 'Bybit', url: 'https://bybit.com/1' }),
  validItem({ title: 'Gate 永续合约资金费率调整公告', source: 'Gate', url: 'https://gate.io/1' }),
  validItem({ title: '鲸鱼转移 5000 BTC 至未知地址', source: 'BlockBeats', url: 'https://bb.com/1', timestamp: BASE_TS - 7200000 }),
  validItem({ title: 'Polymarket: 特朗普胜选概率升至 60%', source: 'Poly-Breaking', url: 'https://poly.com/1' }),
  validItem({ title: 'TechFlow: Meme 币板块今日普涨', source: 'TechFlow', url: 'https://tf.com/1' }),
];

/** Items specifically designed for dedup testing */
const dupItems = [
  validItem({ title: 'HashKey 获准提供零售服务', source: 'HashKeyExchange', url: 'https://a.com/1' }),
  validItem({ title: 'HashKey 获准提供零售服务', source: 'HashKeyExchange', url: 'https://a.com/1' }), // exact dup
  validItem({ title: 'HashKey获准提供零售服务！', source: 'OSL', url: 'https://b.com/1' }),            // similar title, diff source
  validItem({ title: 'Binance 宣布收购合规牌照', source: 'Binance', url: 'https://c.com/1' }),
  validItem({ title: 'binance 宣布收购合规牌照 [Update]', source: 'Binance', url: 'https://c.com/2' }), // normalized same
];

/** Junk items for filter testing */
const junkItems = [
  validItem({ title: '微信扫码 分享划过弹出', url: 'https://service.weibo.com/share/share.php?x=1' }),
  validItem({ title: '置顶', source: 'BlockBeats', url: 'https://bb.com/pin' }),
  validItem({ title: 'short', source: 'Gate', url: 'https://gate.io/s' }),           // too short
  validItem({ title: '#Launchpool', source: 'Binance', url: 'https://binance.com/lp' }),
  validItem({ title: 'Gate Charity', source: 'Gate', url: 'https://gate.io/charity' }),
];

/** Items with various timestamp scenarios */
const timestampItems = [
  validItem({ title: 'valid-ts', timestamp: BASE_TS - 3600000 }),
  validItem({ title: 'old-ts', timestamp: BASE_TS - 200 * 3600000, source: 'Binance' }),  // 200h ago
  validItem({ title: 'future-ts', timestamp: BASE_TS + 3600000 }),                          // 1h in future
  validItem({ title: 'no-ts', timestamp: 0, source: 'TechFlow' }),
  validItem({ title: 'no-ts-strict', timestamp: 0, source: 'BlockBeats' }),                 // strict source
];

/** AI classification test items */
const classificationItems = [
  validItem({ title: 'SFC 撤回 VATP 牌照申请审批新规', source: 'SFC' }),
  validItem({ title: 'Binance 上线新交易对 SOL/USDC', source: 'Binance' }),
  validItem({ title: 'HashKey 推出 RWA 代币化平台', source: 'HashKeyGroup' }),
  validItem({ title: 'OKX CEO 辞职 内部重组', source: 'OKX' }),
];

module.exports = {
  validItem,
  sampleNews,
  dupItems,
  junkItems,
  timestampItems,
  classificationItems,
  BASE_TS,
};
