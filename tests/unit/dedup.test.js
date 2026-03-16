'use strict';
/**
 * tests/unit/dedup.test.js — Deduplication logic unit tests
 */

const { normalizeKey, contentFingerprint } = require('../../db');
const { fullDedupKey, jaccardSimilarity } = require('../../filter');

describe('normalizeKey', () => {
  test('lowercases and strips ASCII punctuation', () => {
    const key = normalizeKey('HashKey 获准提供零售服务!', '');
    expect(key).not.toContain('!');
    expect(key).not.toContain(' ');
    // Note: normalizeKey only strips ASCII punctuation, not full-width characters like ！
  });

  test('strips brackets, parentheses', () => {
    const key = normalizeKey('[ANN] Binance Lists New Pair (Updated)', '');
    expect(key).not.toContain('[');
    expect(key).not.toContain('(');
    expect(key).not.toContain('Updated');
  });

  test('strips common suffixes like "updated", "announcement"', () => {
    const key1 = normalizeKey('OKX License News', '');
    const key2 = normalizeKey('OKX License News (Updated)', '');
    expect(key1).toBe(key2);
  });

  test('appends source when provided', () => {
    const key = normalizeKey('Test Title', 'Binance');
    expect(key).toContain('|binance');
  });

  test('handles empty title', () => {
    expect(normalizeKey('', 'Binance')).toBe('');
  });
});

describe('contentFingerprint', () => {
  test('same content produces same fingerprint', () => {
    const fp1 = contentFingerprint('This is test content for fingerprinting');
    const fp2 = contentFingerprint('This is test content for fingerprinting');
    expect(fp1).toBe(fp2);
  });

  test('different content produces different fingerprint', () => {
    const fp1 = contentFingerprint('HashKey obtains SFC license for retail trading');
    const fp2 = contentFingerprint('Binance announces new listing pair for BTC');
    expect(fp1).not.toBe(fp2);
  });

  test('strips HTML tags', () => {
    const fp1 = contentFingerprint('<p>Hello <b>World</b></p>');
    const fp2 = contentFingerprint('Hello World');
    expect(fp1).toBe(fp2);
  });

  test('handles empty/null input', () => {
    expect(contentFingerprint('')).toBe('');
    expect(contentFingerprint(null)).toBe('');
  });
});

describe('cross-source dedup scenarios', () => {
  test('same event reported by different sources should be detected', () => {
    const sim = jaccardSimilarity(
      'hashkey exchange 获得 sfc 零售牌照批准',
      'hashkey exchange 获得香港 sfc 零售牌照正式批准',
    );
    expect(sim).toBeGreaterThan(0.6);
  });

  test('unrelated news should not match', () => {
    const sim = jaccardSimilarity(
      'binance 上线新交易对 btc/usdt',
      'sfc 发布虚拟资产监管新规',
    );
    expect(sim).toBeLessThan(0.3);
  });
});
