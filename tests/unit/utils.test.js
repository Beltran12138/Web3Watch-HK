'use strict';
/**
 * tests/unit/utils.test.js — Scraper utils unit tests
 */

const { parseTimestamp, extractTimestamp, parseRelativeTime, makeItem } = require('../../scrapers/utils');

describe('parseTimestamp', () => {
  test('parses millisecond timestamps', () => {
    const ts = Date.now();
    expect(parseTimestamp(ts)).toBe(ts);
  });

  test('parses second-level timestamps (10 digits)', () => {
    const sec = Math.floor(Date.now() / 1000);
    expect(parseTimestamp(sec)).toBe(sec * 1000);
  });

  test('parses ISO date strings', () => {
    const ts = parseTimestamp('2026-03-15T10:00:00Z');
    expect(ts).toBeGreaterThan(0);
    expect(new Date(ts).getUTCFullYear()).toBe(2026);
  });

  test('parses date strings with hyphens', () => {
    const ts = parseTimestamp('2026-03-15');
    expect(ts).toBeGreaterThan(0);
  });

  test('rejects null/undefined/empty', () => {
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp(undefined)).toBe(0);
    expect(parseTimestamp('')).toBe(0);
  });

  test('rejects timestamps before 2020', () => {
    expect(parseTimestamp(1000000000)).toBe(0); // Sep 2001 in seconds
  });

  test('parses numeric strings', () => {
    const ts = Date.now();
    expect(parseTimestamp(String(ts))).toBe(ts);
  });
});

describe('extractTimestamp', () => {
  test('extracts YYYY-MM-DD format', () => {
    const ts = extractTimestamp('Published on 2026-03-15');
    expect(ts).toBeGreaterThan(0);
  });

  test('extracts "X hours ago" format', () => {
    const ts = extractTimestamp('3 hours ago');
    const expected = Date.now() - 3 * 3600000;
    expect(Math.abs(ts - expected)).toBeLessThan(2000);
  });

  test('extracts Chinese relative time "3小时前"', () => {
    const ts = extractTimestamp('更新于 3小时前');
    const expected = Date.now() - 3 * 3600000;
    expect(Math.abs(ts - expected)).toBeLessThan(2000);
  });

  test('extracts DD Mon YYYY format', () => {
    const ts = extractTimestamp('12 Mar, 2026, 22:27 CST');
    expect(ts).toBeGreaterThan(0);
  });

  test('does not extract HH:MM alone when allowTimeOnly=false', () => {
    expect(extractTimestamp('14:30')).toBe(0);
  });

  test('extracts HH:MM when allowTimeOnly=true', () => {
    const ts = extractTimestamp('14:30', true);
    expect(ts).toBeGreaterThan(0);
  });

  test('returns 0 for empty input', () => {
    expect(extractTimestamp('')).toBe(0);
    expect(extractTimestamp(null)).toBe(0);
  });
});

describe('parseRelativeTime', () => {
  test('parses "30 minutes ago"', () => {
    const ts = parseRelativeTime('30 minutes ago');
    expect(Math.abs(ts - (Date.now() - 30 * 60000))).toBeLessThan(2000);
  });

  test('parses "2 days ago"', () => {
    const ts = parseRelativeTime('2 days ago');
    expect(Math.abs(ts - (Date.now() - 2 * 86400000))).toBeLessThan(2000);
  });

  test('parses "2天前"', () => {
    const ts = parseRelativeTime('2天前');
    expect(Math.abs(ts - (Date.now() - 2 * 86400000))).toBeLessThan(2000);
  });

  test('returns 0 for non-relative text', () => {
    expect(parseRelativeTime('hello world')).toBe(0);
  });
});

describe('makeItem', () => {
  test('creates item with defaults', () => {
    const item = makeItem({ title: 'Test', source: 'SFC', url: 'https://sfc.hk' });
    expect(item.title).toBe('Test');
    expect(item.source).toBe('SFC');
    expect(item.is_important).toBe(0);
    expect(item.category).toBe('Announcement');
  });

  test('truncates long titles', () => {
    const longTitle = 'A'.repeat(300);
    const item = makeItem({ title: longTitle, source: 'SFC', url: '' });
    expect(item.title.length).toBeLessThanOrEqual(200);
  });

  test('truncates long content', () => {
    const longContent = 'B'.repeat(1000);
    const item = makeItem({ title: 'Test', source: 'SFC', url: '', content: longContent });
    expect(item.content.length).toBeLessThanOrEqual(500);
  });
});
