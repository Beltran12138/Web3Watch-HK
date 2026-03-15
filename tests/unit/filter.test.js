'use strict';
/**
 * tests/unit/filter.test.js — Filter module unit tests
 */

const { isJunkItem, isReportNoise, filterNewsItems, validateTimestamp, getSourceConfig, jaccardSimilarity, semanticDedup } = require('../../filter');
const { validItem, sampleNews, junkItems, timestampItems } = require('../mocks/sample-news');

describe('isJunkItem', () => {
  test('rejects weibo share URLs', () => {
    const item = validItem({ url: 'https://service.weibo.com/share/share.php?x=1', title: 'Some valid title here' });
    expect(isJunkItem(item)).toBe(true);
  });

  test('rejects exact junk titles', () => {
    expect(isJunkItem(validItem({ title: '微信扫码 分享划过弹出' }))).toBe(true);
    expect(isJunkItem(validItem({ title: '置顶' }))).toBe(true);
    expect(isJunkItem(validItem({ title: '#Launchpool' }))).toBe(true);
    expect(isJunkItem(validItem({ title: 'Gate Charity' }))).toBe(true);
  });

  test('rejects titles shorter than MIN_TITLE_LENGTH', () => {
    expect(isJunkItem(validItem({ title: 'short' }))).toBe(true);
    expect(isJunkItem(validItem({ title: 'ab' }))).toBe(true);
  });

  test('rejects pure hashtag titles', () => {
    expect(isJunkItem(validItem({ title: '#BTC' }))).toBe(true);
  });

  test('accepts valid news items', () => {
    expect(isJunkItem(validItem({ title: 'HashKey Exchange 获得 SFC 牌照批准' }))).toBe(false);
    expect(isJunkItem(validItem({ title: 'Binance 收购合规公司' }))).toBe(false);
  });

  test('all predefined junk items are rejected', () => {
    junkItems.forEach(item => {
      expect(isJunkItem(item)).toBe(true);
    });
  });
});

describe('isReportNoise', () => {
  test('filters noise sources', () => {
    expect(isReportNoise(validItem({ source: 'BlockBeats' }))).toBe(true);
    expect(isReportNoise(validItem({ source: 'TechFlow' }))).toBe(true);
    expect(isReportNoise(validItem({ source: 'Poly-Breaking' }))).toBe(true);
  });

  test('filters noise title keywords', () => {
    expect(isReportNoise(validItem({ title: '鲸鱼 转移 1000 BTC' }))).toBe(true);
    expect(isReportNoise(validItem({ title: 'Meme 币板块全线大涨' }))).toBe(true);
    expect(isReportNoise(validItem({ title: '特朗普 发表加密货币言论' }))).toBe(true);
  });

  test('passes valid report items', () => {
    expect(isReportNoise(validItem({ source: 'SFC', title: 'SFC 发布新规' }))).toBe(false);
    expect(isReportNoise(validItem({ source: 'Binance', title: 'Binance 获得牌照' }))).toBe(false);
  });
});

describe('validateTimestamp', () => {
  test('accepts valid recent timestamps', () => {
    const item = validItem({ timestamp: Date.now() - 3600000 });
    expect(validateTimestamp(item)).toBe(true);
  });

  test('rejects expired timestamps based on source config', () => {
    const item = validItem({
      source: 'BlockBeats',
      timestamp: Date.now() - 24 * 3600000, // 24h ago, BlockBeats maxAgeHours = 12
    });
    expect(validateTimestamp(item)).toBe(false);
  });

  test('rejects future timestamps (> 5 min)', () => {
    const item = validItem({ timestamp: Date.now() + 600000 });
    expect(validateTimestamp(item)).toBe(false);
  });

  test('strict timestamp mode rejects items without timestamp', () => {
    const item = validItem({ source: 'BlockBeats', timestamp: 0 });
    expect(validateTimestamp(item)).toBe(false);
  });

  test('non-strict mode assigns Date.now() to items without timestamp', () => {
    const item = validItem({ source: 'Gate', timestamp: 0 });
    const before = Date.now();
    validateTimestamp(item);
    expect(item.timestamp).toBeGreaterThanOrEqual(before);
  });
});

describe('getSourceConfig', () => {
  test('returns config for known sources', () => {
    const config = getSourceConfig('Binance');
    expect(config.maxAgeHours).toBe(48);
    expect(config.dedupMode).toBe('strict');
  });

  test('returns default config for unknown sources', () => {
    const config = getSourceConfig('UnknownSource');
    expect(config.maxAgeHours).toBe(48);
    expect(config.dedupMode).toBe('normal');
  });
});

describe('jaccardSimilarity', () => {
  test('identical strings return 1', () => {
    expect(jaccardSimilarity('hello', 'hello')).toBe(1);
  });

  test('completely different strings return low score', () => {
    expect(jaccardSimilarity('abc', 'xyz')).toBeLessThan(0.2);
  });

  test('similar strings return high score', () => {
    const sim = jaccardSimilarity(
      'hashkey获准提供零售服务',
      'hashkey获准向零售用户提供服务'
    );
    expect(sim).toBeGreaterThan(0.5);
  });

  test('handles empty strings', () => {
    expect(jaccardSimilarity('', 'hello')).toBe(0);
    expect(jaccardSimilarity('', '')).toBe(0);
  });
});

describe('semanticDedup', () => {
  test('removes cross-source duplicates', () => {
    const items = [
      validItem({ title: 'HashKey 获得零售牌照', source: 'SFC', alpha_score: 90 }),
      validItem({ title: 'HashKey 获得零售牌照批准', source: 'BlockBeats', alpha_score: 50 }),
    ];
    const result = semanticDedup(items, 0.6);
    expect(result.length).toBe(1);
    expect(result[0].alpha_score).toBe(90); // keeps higher score
  });

  test('does not remove same-source items', () => {
    const items = [
      validItem({ title: 'News A about topic', source: 'Binance', url: 'https://a.com' }),
      validItem({ title: 'News A about topic updated', source: 'Binance', url: 'https://b.com' }),
    ];
    const result = semanticDedup(items, 0.6);
    // Same source items are not checked for cross-source dedup
    expect(result.length).toBe(2);
  });
});

describe('filterNewsItems', () => {
  test('filters junk and deduplicates', () => {
    const input = [
      ...sampleNews,
      validItem({ title: '微信扫码 分享划过弹出', url: 'https://weibo.com/share' }),
    ];
    const result = filterNewsItems(input);
    expect(result.length).toBeLessThan(input.length);
    expect(result.every(r => !isJunkItem(r))).toBe(true);
  });

  test('removes URL duplicates', () => {
    const url = 'https://example.com/same-url';
    const input = [
      validItem({ title: 'Item 1 with valid title', url }),
      validItem({ title: 'Item 2 with valid title', url }),
    ];
    const result = filterNewsItems(input);
    expect(result.length).toBe(1);
  });
});
