'use strict';
/**
 * tests/unit/sources-config.test.js — config.js SOURCES 总表派生出的集合必须与重构前（2026-10-08）一致。
 * 改了这里的期望值 = 改了哪些源被抓 / 过 AI / 推企微，必须是有意为之。
 */

const config = require('../../config');
const { SCRAPERS_MAP, getEnabledScrapers } = require('../../scrapers/index');
const { pushManager } = require('../../push-channel');

afterAll(() => {
  pushManager.cleanup();
});

const sorted = set => [...set].sort();

describe('derived source sets (pinned to pre-refactor values)', () => {
  test('WECOM_BLOCK_SOURCES', () => {
    expect(sorted(config.WECOM_BLOCK_SOURCES)).toEqual([
      'TwitterAB', 'WuShuo', 'Phyrex', 'JustinSun', 'XieJiayin',
      'Poly-Breaking', 'Poly-China',
      'TechFlow', 'BlockBeats',
    ].sort());
  });

  test('HK_SOURCES', () => {
    expect(sorted(config.HK_SOURCES)).toEqual([
      'SFC', 'OSL', 'Exio', 'TechubNews',
      'HashKeyGroup', 'HashKeyExchange', 'WuBlock',
    ].sort());
  });

  test('AI_SOURCES', () => {
    expect(sorted(config.AI_SOURCES)).toEqual([
      'SFC', 'TechubNews', 'Exio', 'OSL', 'WuBlock', 'PRNewswire', 'HTX', 'MEXC', 'Gate',
      'Binance', 'OKX', 'Bybit', 'Bitget', 'KuCoin', 'HashKeyGroup', 'HashKeyExchange',
      'BlockBeats', 'TechFlow',
    ].sort());
  });

  test('MAINSTREAM_EXCHANGES', () => {
    expect(sorted(config.MAINSTREAM_EXCHANGES)).toEqual([
      'Gate', 'OKX', 'HTX', 'Bybit', 'MEXC', 'Bitget', 'Binance', 'KuCoin',
    ].sort());
  });

  test('REPORT_NOISE_SOURCES', () => {
    expect(sorted(config.REPORT_NOISE_SOURCES)).toEqual([
      'BlockBeats', 'TechFlow',
      'Poly-Breaking', 'Poly-China',
      'TwitterAB', 'WuShuo', 'Phyrex', 'JustinSun', 'XieJiayin',
    ].sort());
  });

  test('HIGH_FREQ_SOURCES (order = execution order; dead "TwitterKOLs" key dropped, it had no scraper)', () => {
    expect(config.HIGH_FREQ_SOURCES).toEqual([
      'SFC', 'Binance', 'OKX',
      'PolymarketBreaking', 'PolymarketChina',
    ]);
  });

  test('LOW_FREQ_SOURCES (order = execution order)', () => {
    expect(config.LOW_FREQ_SOURCES).toEqual([
      'TechFlow', 'PRNewswire', 'BlockBeats',
      'OSL', 'TechubNews', 'Exio',
      'WuBlock', 'HashKeyGroup', 'KuCoin', 'HashKeyExchange',
      'Bybit', 'Bitget', 'Mexc', 'Gate', 'Htx',
    ]);
  });

  test('SOURCE_CONFIGS', () => {
    const strict = (maxAgeHours, enableStrictTimestamp, pushCooldownHours) =>
      ({ maxAgeHours, enableStrictTimestamp, dedupMode: 'strict', pushCooldownHours });
    expect(config.SOURCE_CONFIGS).toStrictEqual({
      'SFC':             strict(168, false, 48),
      'OSL':             strict(72, false, 24),
      'Exio':            strict(72, false, 24),
      'TechubNews':      strict(24, true, 48),
      'Matrixport':      { ...strict(24, true, 24), disabled: true },
      'HashKeyGroup':    strict(48, false, 24),
      'HashKeyExchange': strict(48, false, 24),
      'WuBlock':         strict(48, false, 48),
      'PRNewswire':      strict(24, true, 24),
      'Binance':         strict(48, false, 24),
      'OKX':             strict(48, false, 24),
      'Bybit':           strict(48, false, 24),
      'HTX':             strict(48, false, 24),
      'Gate':            strict(48, false, 24),
      'MEXC':            strict(48, false, 24),
      'Bitget':          strict(48, false, 24),
      'KuCoin':          strict(48, false, 24),
      'TwitterAB':       strict(24, true, 12),
      'WuShuo':          strict(24, true, 12),
      'Phyrex':          strict(24, true, 12),
      'JustinSun':       strict(24, true, 12),
      'XieJiayin':       strict(24, true, 12),
      'BlockBeats':      strict(12, true, 6),
      'TechFlow':        strict(72, false, 24),
      'Poly-Breaking':   strict(24, true, 12),
      'Poly-China':      strict(24, true, 12),
    });
  });

  test('scraper key → news.source mapping is explicit', () => {
    expect(config.SOURCE_NAME_BY_SCRAPER_KEY).toMatchObject({
      PolymarketBreaking: 'Poly-Breaking',
      PolymarketChina:    'Poly-China',
      Mexc:               'MEXC',
      Htx:                'HTX',
    });
  });
});

describe('scraper registry vs SOURCES table', () => {
  test('every scraper is registered, Matrixport is the only disabled one', () => {
    expect(Object.keys(SCRAPERS_MAP).sort()).toEqual([
      'SFC', 'TechFlow', 'PRNewswire', 'BlockBeats', 'OSL', 'TechubNews', 'OKX',
      'Exio', 'Matrixport', 'WuBlock', 'HashKeyGroup', 'KuCoin', 'HashKeyExchange', 'Binance', 'Bybit',
      'Bitget', 'Mexc', 'PolymarketBreaking', 'PolymarketChina', 'Gate', 'Htx',
    ].sort());
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const enabled = Object.keys(getEnabledScrapers(SCRAPERS_MAP));
    log.mockRestore();
    expect(Object.keys(SCRAPERS_MAP).filter(k => !enabled.includes(k))).toEqual(['Matrixport']);
  });

  test('every tier key resolves to an enabled scraper', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const enabled = getEnabledScrapers(SCRAPERS_MAP);
    log.mockRestore();
    for (const key of [...config.HIGH_FREQ_SOURCES, ...config.LOW_FREQ_SOURCES]) {
      expect(typeof enabled[key]).toBe('function');
    }
  });
});
