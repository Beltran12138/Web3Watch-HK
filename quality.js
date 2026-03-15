'use strict';
/**
 * quality.js — Data quality validation module
 *
 * Validates news items at ingestion time for:
 * - Completeness (required fields present)
 * - Consistency (category matches content, score ranges valid)
 * - Timeliness (timestamps are reasonable)
 * - URL validity
 * - Content quality (not too short, not garbled)
 */

const { BUSINESS_CATEGORIES, COMPETITOR_CATEGORIES, SOURCE_CONFIGS } = require('./config');

/** @typedef {'pass'|'warn'|'fail'} QualityLevel */

/**
 * @typedef {Object} QualityReport
 * @property {QualityLevel} level - Overall quality level
 * @property {number} score - Quality score 0-100
 * @property {Array<{ field: string, issue: string, severity: QualityLevel }>} issues
 */

const VALID_BUSINESS_CATS = new Set(BUSINESS_CATEGORIES);
const VALID_COMPETITOR_CATS = new Set(COMPETITOR_CATEGORIES);
const KNOWN_SOURCES = new Set(Object.keys(SOURCE_CONFIGS));

class DataQualityChecker {
  constructor(options = {}) {
    this.options = {
      minTitleLength: options.minTitleLength || 8,
      maxTitleLength: options.maxTitleLength || 500,
      minContentLength: options.minContentLength || 0,
      maxUrlLength: options.maxUrlLength || 2048,
      maxTimestampDriftMs: options.maxTimestampDriftMs || 10 * 60 * 1000, // 10 min into future
      ...options,
    };

    /** @type {{ total: number, passed: number, warned: number, failed: number }} */
    this.stats = { total: 0, passed: 0, warned: 0, failed: 0 };
  }

  /**
   * Validate a single news item
   * @param {object} item
   * @returns {QualityReport}
   */
  validate(item) {
    const issues = [];

    this._checkCompleteness(item, issues);
    this._checkConsistency(item, issues);
    this._checkTimeliness(item, issues);
    this._checkUrl(item, issues);
    this._checkContentQuality(item, issues);

    // Calculate score
    const failCount = issues.filter(i => i.severity === 'fail').length;
    const warnCount = issues.filter(i => i.severity === 'warn').length;
    const score = Math.max(0, 100 - failCount * 25 - warnCount * 10);

    let level = 'pass';
    if (failCount > 0) level = 'fail';
    else if (warnCount > 0) level = 'warn';

    // Update stats
    this.stats.total++;
    if (level === 'pass') this.stats.passed++;
    else if (level === 'warn') this.stats.warned++;
    else this.stats.failed++;

    return { level, score, issues };
  }

  /**
   * Validate a batch of items and return summary
   * @param {Array<object>} items
   * @returns {{ items: Array<{ item: object, report: QualityReport }>, summary: object }}
   */
  validateBatch(items) {
    const results = items.map(item => ({
      item,
      report: this.validate(item),
    }));

    const passed = results.filter(r => r.report.level === 'pass').length;
    const warned = results.filter(r => r.report.level === 'warn').length;
    const failed = results.filter(r => r.report.level === 'fail').length;
    const avgScore = results.length > 0
      ? (results.reduce((sum, r) => sum + r.report.score, 0) / results.length).toFixed(1)
      : 0;

    // Aggregate common issues
    const issueFreq = {};
    results.forEach(r => {
      r.report.issues.forEach(issue => {
        const key = `${issue.field}:${issue.issue}`;
        issueFreq[key] = (issueFreq[key] || 0) + 1;
      });
    });

    const topIssues = Object.entries(issueFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ issue: key, count }));

    return {
      items: results,
      summary: {
        total: results.length,
        passed,
        warned,
        failed,
        avgScore: Number(avgScore),
        passRate: results.length > 0 ? ((passed / results.length) * 100).toFixed(1) + '%' : 'N/A',
        topIssues,
      },
    };
  }

  // ── Completeness ────────────────────────────────────────────────────────

  _checkCompleteness(item, issues) {
    if (!item.title || item.title.trim().length === 0) {
      issues.push({ field: 'title', issue: 'missing', severity: 'fail' });
    }

    if (!item.source || item.source.trim().length === 0) {
      issues.push({ field: 'source', issue: 'missing', severity: 'fail' });
    }

    if (!item.url || item.url.trim().length === 0) {
      issues.push({ field: 'url', issue: 'missing', severity: 'warn' });
    }

    if (!item.timestamp || item.timestamp === 0) {
      issues.push({ field: 'timestamp', issue: 'missing', severity: 'warn' });
    }
  }

  // ── Consistency ─────────────────────────────────────────────────────────

  _checkConsistency(item, issues) {
    // Business category validation
    if (item.business_category && !VALID_BUSINESS_CATS.has(item.business_category)) {
      issues.push({
        field: 'business_category',
        issue: `invalid value: "${item.business_category}"`,
        severity: 'warn',
      });
    }

    // Competitor category validation
    if (item.competitor_category && !VALID_COMPETITOR_CATS.has(item.competitor_category)) {
      issues.push({
        field: 'competitor_category',
        issue: `invalid value: "${item.competitor_category}"`,
        severity: 'warn',
      });
    }

    // Alpha score range
    if (item.alpha_score !== undefined && item.alpha_score !== null) {
      if (item.alpha_score < 0 || item.alpha_score > 100) {
        issues.push({
          field: 'alpha_score',
          issue: `out of range: ${item.alpha_score}`,
          severity: 'warn',
        });
      }
    }

    // is_important should match alpha_score when both exist
    if (item.alpha_score >= 85 && item.is_important === 0) {
      issues.push({
        field: 'is_important',
        issue: 'high alpha_score but not marked important',
        severity: 'warn',
      });
    }

    // Source validation
    if (item.source && !KNOWN_SOURCES.has(item.source)) {
      issues.push({
        field: 'source',
        issue: `unknown source: "${item.source}"`,
        severity: 'warn',
      });
    }
  }

  // ── Timeliness ──────────────────────────────────────────────────────────

  _checkTimeliness(item, issues) {
    if (!item.timestamp || item.timestamp === 0) return;

    const now = Date.now();

    // Future timestamp
    if (item.timestamp > now + this.options.maxTimestampDriftMs) {
      issues.push({
        field: 'timestamp',
        issue: `future timestamp: ${new Date(item.timestamp).toISOString()}`,
        severity: 'warn',
      });
    }

    // Very old timestamp (> 1 year)
    if (item.timestamp < now - 365 * 86400000) {
      issues.push({
        field: 'timestamp',
        issue: 'timestamp older than 1 year',
        severity: 'fail',
      });
    }

    // Reasonable but stale (> 7 days for non-SFC sources)
    if (item.source !== 'SFC' && item.timestamp < now - 7 * 86400000) {
      issues.push({
        field: 'timestamp',
        issue: 'item older than 7 days',
        severity: 'warn',
      });
    }
  }

  // ── URL ──────────────────────────────────────────────────────────────────

  _checkUrl(item, issues) {
    if (!item.url) return;

    // Length check
    if (item.url.length > this.options.maxUrlLength) {
      issues.push({ field: 'url', issue: 'exceeds max length', severity: 'warn' });
    }

    // Basic URL format
    if (!item.url.startsWith('http://') && !item.url.startsWith('https://')) {
      issues.push({ field: 'url', issue: 'invalid protocol', severity: 'warn' });
    }

    // Common junk URLs
    if (/share\.php|javascript:|data:/i.test(item.url)) {
      issues.push({ field: 'url', issue: 'junk URL pattern', severity: 'fail' });
    }
  }

  // ── Content Quality ─────────────────────────────────────────────────────

  _checkContentQuality(item, issues) {
    const title = (item.title || '').trim();

    // Title length
    if (title.length > 0 && title.length < this.options.minTitleLength) {
      issues.push({ field: 'title', issue: `too short (${title.length} chars)`, severity: 'warn' });
    }

    if (title.length > this.options.maxTitleLength) {
      issues.push({ field: 'title', issue: `too long (${title.length} chars)`, severity: 'warn' });
    }

    // Garbled content detection (high ratio of special chars)
    if (title.length > 10) {
      const specialCharRatio = (title.match(/[^\w\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length / title.length;
      if (specialCharRatio > 0.4) {
        issues.push({ field: 'title', issue: 'possibly garbled content', severity: 'warn' });
      }
    }

    // Detail quality
    if (item.detail && item.detail.length > 200) {
      issues.push({ field: 'detail', issue: `too long (${item.detail.length} chars)`, severity: 'warn' });
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { total: 0, passed: 0, warned: 0, failed: 0 };
  }
}

const qualityChecker = new DataQualityChecker();

module.exports = { DataQualityChecker, qualityChecker };
