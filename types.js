'use strict';
/**
 * types.js — JSDoc type definitions for Alpha Radar
 *
 * Centralized type definitions for IDE autocompletion and documentation.
 * Import with: const Types = require('./types');
 */

/**
 * @typedef {Object} NewsItem
 * @property {number}  [id] - Auto-incremented database ID
 * @property {string}  title - News title (max 200 chars)
 * @property {string}  [normalized_title] - Normalized title for dedup
 * @property {string}  [content] - Full content text (max 500 chars)
 * @property {string}  [detail] - AI-generated summary (max 80 chars)
 * @property {string}  [impact] - "利好" | "利空" | "中性"
 * @property {string}  [bitv_action] - Recommended action for BitV
 * @property {string}  source - Data source name (e.g. "Binance", "SFC")
 * @property {string}  [url] - Original news URL (unique)
 * @property {string}  [category] - Raw category from source
 * @property {string}  [business_category] - AI-classified business category
 * @property {string}  [competitor_category] - AI-classified competitor category
 * @property {number}  [timestamp] - Unix timestamp in milliseconds
 * @property {number}  [is_important] - 0 or 1
 * @property {number}  [alpha_score] - Intelligence value score 0-100
 * @property {number}  [sent_to_wecom] - 0 or 1
 * @property {string}  [created_at] - ISO datetime string
 */

/**
 * @typedef {Object} SourceConfig
 * @property {number}  maxAgeHours - Maximum age of news items in hours
 * @property {boolean} enableStrictTimestamp - Reject items without valid timestamp
 * @property {'strict'|'normal'|'loose'} dedupMode - Deduplication strictness
 * @property {number}  pushCooldownHours - Minimum hours between pushes from same source
 * @property {boolean} [disabled] - Whether source is disabled
 */

/**
 * @typedef {Object} AIClassificationResult
 * @property {string}  business_category - One of BUSINESS_CATEGORIES
 * @property {string}  competitor_category - One of COMPETITOR_CATEGORIES
 * @property {string}  detail - Summary (max 80 chars)
 * @property {number}  alpha_score - 0-100
 * @property {number}  is_important - 0 or 1
 * @property {string}  [impact] - "利好" | "利空" | "中性"
 * @property {string}  [bitv_action] - Action recommendation
 * @property {string}  [_ai_source] - Which AI provider was used
 * @property {string}  [_prompt_version] - Which prompt version was used
 */

/**
 * @typedef {Object} ScraperResult
 * @property {string}  title
 * @property {string}  [content]
 * @property {string}  source
 * @property {string}  [url]
 * @property {string}  [category]
 * @property {number}  [timestamp]
 * @property {number}  [is_important]
 */

/**
 * @typedef {Object} QualityReport
 * @property {'pass'|'warn'|'fail'} level - Overall quality level
 * @property {number}  score - Quality score 0-100
 * @property {Array<QualityIssue>} issues
 */

/**
 * @typedef {Object} QualityIssue
 * @property {string}  field - Field name with issue
 * @property {string}  issue - Description of the issue
 * @property {'pass'|'warn'|'fail'} severity
 */

/**
 * @typedef {Object} AlertEntry
 * @property {'info'|'warn'|'error'|'critical'} level
 * @property {string}  category - e.g. 'scraper', 'ai', 'push', 'db'
 * @property {string}  message
 * @property {number}  ts - Timestamp
 * @property {object}  [context]
 */

/**
 * @typedef {Object} PipelineRunResult
 * @property {Array<NewsItem>} items - Processed items
 * @property {object}  stats - Pipeline statistics
 * @property {Array<{ stage: string, error: string, durationMs: number }>} errors
 */

/**
 * @typedef {Object} PushMessage
 * @property {string}  [title] - Message title
 * @property {string}  content - Message body
 * @property {'text'|'markdown'} [type] - Message format
 * @property {string}  [html] - HTML version (for email)
 */

/**
 * @typedef {Object} StatsResponse
 * @property {number}  total - Total news count
 * @property {number}  important - Important news count
 * @property {Array<{ business_category: string, n: number }>} categories
 * @property {Array<{ source: string, n: number }>} sources
 */

/**
 * @typedef {Object} HealthResponse
 * @property {string}  status - 'ok' | 'error'
 * @property {number}  uptime - Uptime in seconds
 * @property {string}  startedAt - ISO datetime
 * @property {object}  db - Database stats
 * @property {object}  [ai] - AI provider status
 * @property {object}  [push] - Push channel status
 * @property {object}  [storage] - Storage stats
 * @property {string}  version - Package version
 */

/**
 * @typedef {Object} SourceHealthEntry
 * @property {string}  source
 * @property {number}  latest_timestamp
 * @property {number}  total_count
 * @property {number}  [last_pushed_timestamp]
 * @property {string}  [last_pushed_title]
 * @property {'healthy'|'stale'} status
 * @property {number}  hours_since_update
 */

// Export empty object — this file is used for JSDoc types only
module.exports = {};
