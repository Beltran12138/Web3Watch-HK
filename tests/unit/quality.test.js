'use strict';
/**
 * tests/unit/quality.test.js — Data quality checker unit tests
 */

const { DataQualityChecker } = require('../../quality');
const { validItem } = require('../mocks/sample-news');

describe('DataQualityChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new DataQualityChecker();
  });

  describe('completeness checks', () => {
    test('passes for complete items', () => {
      const report = checker.validate(validItem());
      expect(report.level).not.toBe('fail');
    });

    test('fails for missing title', () => {
      const report = checker.validate(validItem({ title: '' }));
      expect(report.level).toBe('fail');
      expect(report.issues.some(i => i.field === 'title' && i.issue === 'missing')).toBe(true);
    });

    test('fails for missing source', () => {
      const report = checker.validate(validItem({ source: '' }));
      expect(report.level).toBe('fail');
      expect(report.issues.some(i => i.field === 'source' && i.issue === 'missing')).toBe(true);
    });

    test('warns for missing URL', () => {
      const report = checker.validate(validItem({ url: '' }));
      expect(report.issues.some(i => i.field === 'url' && i.issue === 'missing')).toBe(true);
    });

    test('warns for missing timestamp', () => {
      const report = checker.validate(validItem({ timestamp: 0 }));
      expect(report.issues.some(i => i.field === 'timestamp' && i.issue === 'missing')).toBe(true);
    });
  });

  describe('consistency checks', () => {
    test('warns for invalid business category', () => {
      const report = checker.validate(validItem({ business_category: 'InvalidCategory' }));
      expect(report.issues.some(i => i.field === 'business_category')).toBe(true);
    });

    test('warns for invalid competitor category', () => {
      const report = checker.validate(validItem({ competitor_category: 'WrongCat' }));
      expect(report.issues.some(i => i.field === 'competitor_category')).toBe(true);
    });

    test('warns for out-of-range alpha_score', () => {
      const report = checker.validate(validItem({ alpha_score: 150 }));
      expect(report.issues.some(i => i.field === 'alpha_score')).toBe(true);
    });

    test('warns for high score but not marked important', () => {
      const report = checker.validate(validItem({ alpha_score: 90, is_important: 0 }));
      expect(report.issues.some(i => i.field === 'is_important')).toBe(true);
    });

    test('passes for valid categories', () => {
      const report = checker.validate(validItem({
        business_category: '合规',
        competitor_category: '香港合规所',
      }));
      const catIssues = report.issues.filter(i =>
        i.field === 'business_category' || i.field === 'competitor_category',
      );
      expect(catIssues).toHaveLength(0);
    });
  });

  describe('timeliness checks', () => {
    test('warns for future timestamps', () => {
      const report = checker.validate(validItem({ timestamp: Date.now() + 3600000 }));
      expect(report.issues.some(i => i.field === 'timestamp' && i.issue.includes('future'))).toBe(true);
    });

    test('fails for timestamps older than 1 year', () => {
      const report = checker.validate(validItem({ timestamp: Date.now() - 400 * 86400000 }));
      expect(report.issues.some(i => i.field === 'timestamp' && i.issue.includes('1 year'))).toBe(true);
    });
  });

  describe('URL checks', () => {
    test('warns for invalid protocol', () => {
      const report = checker.validate(validItem({ url: 'ftp://example.com/news' }));
      expect(report.issues.some(i => i.field === 'url' && i.issue === 'invalid protocol')).toBe(true);
    });

    test('fails for junk URLs', () => {
      const report = checker.validate(validItem({ url: 'https://example.com/share.php?x=1' }));
      expect(report.issues.some(i => i.field === 'url' && i.issue === 'junk URL pattern')).toBe(true);
    });
  });

  describe('content quality', () => {
    test('warns for too-short titles', () => {
      const report = checker.validate(validItem({ title: 'Short' }));
      expect(report.issues.some(i => i.field === 'title' && i.issue.includes('too short'))).toBe(true);
    });
  });

  describe('batch validation', () => {
    test('validates batch and returns summary', () => {
      const items = [
        validItem(),
        validItem({ title: '' }),
        validItem({ source: '', timestamp: 0 }),
      ];
      const result = checker.validateBatch(items);
      expect(result.summary.total).toBe(3);
      expect(result.summary.failed).toBeGreaterThan(0);
      expect(result.summary.topIssues.length).toBeGreaterThan(0);
    });
  });

  describe('stats tracking', () => {
    test('tracks validation stats', () => {
      checker.validate(validItem());
      checker.validate(validItem({ title: '' }));
      const stats = checker.getStats();
      expect(stats.total).toBe(2);
      expect(stats.failed).toBe(1);
    });

    test('resets stats', () => {
      checker.validate(validItem());
      checker.resetStats();
      const stats = checker.getStats();
      expect(stats.total).toBe(0);
    });
  });
});
