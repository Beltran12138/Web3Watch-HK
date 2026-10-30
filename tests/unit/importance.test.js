'use strict';
/**
 * tests/unit/importance.test.js — Importance scoring unit tests
 */

const { checkImportance, isHkPushNoise, ruleBasedPreFilter } = require('../../scrapers/index');
const { validItem } = require('../mocks/sample-news');
const { pushManager } = require('../../push-channel');

afterAll(() => {
  pushManager.cleanup();
});

describe('checkImportance', () => {
  test('blocks WeCom-blocked sources', () => {
    expect(checkImportance(validItem({ source: 'BlockBeats' }))).toBe(0);
    expect(checkImportance(validItem({ source: 'TechFlow' }))).toBe(0);
    expect(checkImportance(validItem({ source: 'Poly-Breaking' }))).toBe(0);
    expect(checkImportance(validItem({ source: 'WuShuo' }))).toBe(0);
  });

  test('marks HK sources as important', () => {
    expect(checkImportance(validItem({ source: 'SFC' }))).toBe(1);
    expect(checkImportance(validItem({ source: 'OSL' }))).toBe(1);
    expect(checkImportance(validItem({ source: 'Exio' }))).toBe(1);
    expect(checkImportance(validItem({ source: 'HashKeyGroup' }))).toBe(1);
  });

  test('PRNewswire: HK companies are important', () => {
    expect(checkImportance(validItem({
      source: 'PRNewswire',
      title: 'HashKey Digital Asset Group Announces New Service',
    }))).toBe(1);
  });

  test('PRNewswire: non-HK items are not important', () => {
    expect(checkImportance(validItem({
      source: 'PRNewswire',
      title: 'Random Tech Company Launches New Product',
    }))).toBe(0);
  });

  test('exchange listing/上线 items excluded', () => {
    expect(checkImportance(validItem({
      source: 'Binance',
      title: 'Binance Will List New Pair PEPE/USDT',
    }))).toBe(0);
  });

  test('exchange major actions are important', () => {
    expect(checkImportance(validItem({
      source: 'Binance',
      title: 'Binance CEO Announces Regulatory License Acquisition',
    }))).toBe(1);
  });

  test('HK keywords in title mark as important for non-special sources', () => {
    // For a source that is not blocked, not HK, not PRNewswire, not mainstream exchange
    expect(checkImportance(validItem({
      source: 'UnknownSource',
      title: '香港 Web3 大会将在明年举办',
      category: 'HK',
    }))).toBe(1);
  });
});

describe('ruleBasedPreFilter', () => {
  test('skips listing announcements', () => {
    const item = validItem({ title: 'Binance Will List SOL/USDT', source: 'Binance' });
    expect(ruleBasedPreFilter(item)).toBe(true);
    expect(item.business_category).toBe('交易/量化');
  });

  test('does NOT skip HK listing announcements', () => {
    const item = validItem({ title: 'HashKey Exchange 上线 BTC/HKD', source: 'HashKeyExchange' });
    expect(ruleBasedPreFilter(item)).toBe(false);
  });

  test('skips funding rate items', () => {
    const item = validItem({ title: '资金费率异常 BTC 永续合约', source: 'Gate' });
    expect(ruleBasedPreFilter(item)).toBe(true);
  });

  test('skips whale/liquidation items', () => {
    const item = validItem({ title: '鲸鱼大额转移 5000 BTC', source: 'BlockBeats' });
    expect(ruleBasedPreFilter(item)).toBe(true);
  });

  test('skips meme/airdrop items', () => {
    const item = validItem({ title: 'MEME 币空投活动开始', source: 'Binance' });
    expect(ruleBasedPreFilter(item)).toBe(true);
  });

  test('skips very short titles from non-HK sources', () => {
    const item = validItem({ title: 'BTC!', source: 'Gate' });
    expect(ruleBasedPreFilter(item)).toBe(true);
  });

  test('does NOT skip regulatory news', () => {
    const item = validItem({ title: 'SFC 发布新的虚拟资产交易平台监管要求', source: 'SFC' });
    expect(ruleBasedPreFilter(item)).toBe(false);
  });
});

describe('isHkPushNoise (HK sources are pushed in full, minus digests and marketing)', () => {
  test.each([
    ['TechubNews', '10月30日早茶嘆熱點 | 香港9月出口升64.9%創歷史新高'],
    ['TechubNews', '10月16日早茶叹热点 | “粤艇南下”今日首航'],
    ['HashKeyExchange', 'Notice on HashKey Exchange Bank Channel Maintenance'],
    ['OSL', 'OSL Golden Autumn Trading Challenge: Share 50,000 USDT Prize Pool'],
  ])('%s: %s → noise', (source, title) => {
    expect(isHkPushNoise(validItem({ source, title }))).toBe(true);
  });

  test.each([
    ['SFC', '[SFC] SFC approves first-ever secondary trading of tokenised public funds'],
    ['HashKeyGroup', 'HashKey RWA Launches First Product Under the HashKey “hToken” Series'],
    ['Exio', 'EX.IO将终止TBILL服务'],
    // 非 HK 源的营销稿不归这条规则管
    ['Bybit', 'New Prize Pool Unlocked: Bybit Extends USD1 Hold & Earn Program'],
  ])('%s: %s → not noise', (source, title) => {
    expect(isHkPushNoise(validItem({ source, title }))).toBe(false);
  });
});
