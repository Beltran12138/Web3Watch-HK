'use strict';
/**
 * scrapers/middleware.js — Scraper middleware layer
 *
 * Provides:
 * - User-Agent rotation
 * - Request delay with jitter
 * - Anti-detection headers
 * - Retry with exponential backoff
 * - Response validation
 * - DOM change detection (structural fingerprinting)
 */

const { SCRAPER } = require('../config');

// ── User-Agent Pool ──────────────────────────────────────────────────────────

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
];

/**
 * Get a random User-Agent from the pool
 */
function getRandomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

// ── Anti-Detection Headers ───────────────────────────────────────────────────

/**
 * Generate realistic browser headers
 * @param {string} [referer] - Optional referer URL
 */
function getBrowserHeaders(referer = '') {
  const headers = {
    'User-Agent': getRandomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };

  if (referer) {
    headers['Referer'] = referer;
    headers['Sec-Fetch-Site'] = 'same-origin';
  }

  return headers;
}

// ── Request Delay ────────────────────────────────────────────────────────────

/**
 * Sleep with random jitter to avoid detection patterns
 * @param {number} baseMs - Base delay in ms
 * @param {number} [jitterMs=1000] - Max random jitter in ms
 */
async function delayWithJitter(baseMs, jitterMs = 1000) {
  const jitter = Math.floor(Math.random() * jitterMs);
  await new Promise(r => setTimeout(r, baseMs + jitter));
}

// ── Retry with Exponential Backoff ───────────────────────────────────────────

/**
 * Execute an async function with retry and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {object} options
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.baseDelayMs=2000]
 * @param {number} [options.maxDelayMs=30000]
 * @param {Function} [options.shouldRetry] - Custom retry condition
 * @param {string} [options.label=''] - Label for logging
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = SCRAPER.MAX_RETRIES || 3,
    baseDelayMs = 2000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
    label = '',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !shouldRetry(err, attempt)) {
        break;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.floor(Math.random() * 1000);
      console.warn(`[Retry${label ? ' ' + label : ''}] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay + jitter}ms...`);
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

// ── Response Validation ──────────────────────────────────────────────────────

/**
 * Validate HTTP response for common issues
 * @param {object} response - Axios response or similar
 * @param {string} source - Source name for logging
 * @returns {{ valid: boolean, issue?: string }}
 */
function validateResponse(response, source = '') {
  if (!response) {
    return { valid: false, issue: 'null response' };
  }

  const status = response.status || response.statusCode;

  if (status === 403) {
    return { valid: false, issue: 'blocked (403 Forbidden)' };
  }

  if (status === 429) {
    return { valid: false, issue: 'rate limited (429)' };
  }

  if (status >= 500) {
    return { valid: false, issue: `server error (${status})` };
  }

  const body = response.data || response.body || '';
  const text = typeof body === 'string' ? body : JSON.stringify(body);

  // Cloudflare challenge detection
  if (text.includes('cf-browser-verification') || text.includes('challenge-platform')) {
    return { valid: false, issue: 'Cloudflare challenge detected' };
  }

  // CAPTCHA detection
  if (/captcha|recaptcha|hcaptcha/i.test(text)) {
    return { valid: false, issue: 'CAPTCHA detected' };
  }

  // Empty response
  if (text.length < 100 && status === 200) {
    return { valid: false, issue: 'suspiciously short response' };
  }

  return { valid: true };
}

// ── DOM Structure Fingerprinting ─────────────────────────────────────────────

/** @type {Map<string, string>} - Source -> DOM fingerprint */
const domFingerprints = new Map();

/**
 * Generate a structural fingerprint of key DOM elements
 * @param {string} html - Page HTML
 * @param {string} selector - CSS selector for main content area
 * @returns {string} - Structural fingerprint
 */
function generateDOMFingerprint(html, selector = 'body') {
  // Simple structural hash: extract tag structure without content
  const tagPattern = /<(\w+)(?:\s[^>]*)?>/g;
  const tags = [];
  let match;
  let count = 0;
  while ((match = tagPattern.exec(html)) !== null && count < 200) {
    tags.push(match[1].toLowerCase());
    count++;
  }
  return tags.join(',');
}

/**
 * Check if DOM structure has changed significantly for a source
 * @param {string} source - Source name
 * @param {string} html - Current page HTML
 * @returns {{ changed: boolean, similarity: number }}
 */
function checkDOMChange(source, html) {
  const currentFP = generateDOMFingerprint(html);
  const previousFP = domFingerprints.get(source);

  if (!previousFP) {
    domFingerprints.set(source, currentFP);
    return { changed: false, similarity: 1.0 };
  }

  // Calculate similarity using Jaccard on tag sequences
  const prevTags = new Set(previousFP.split(','));
  const currTags = new Set(currentFP.split(','));
  const intersection = [...prevTags].filter(t => currTags.has(t)).length;
  const union = new Set([...prevTags, ...currTags]).size;
  const similarity = union > 0 ? intersection / union : 1.0;

  domFingerprints.set(source, currentFP);

  const changed = similarity < 0.7; // Less than 70% similar = significant change
  if (changed) {
    console.warn(`[DOM Change] ${source}: Structure changed significantly (similarity: ${similarity.toFixed(2)})`);
  }

  return { changed, similarity };
}

// ── Puppeteer Page Enhancement ───────────────────────────────────────────────

/**
 * Apply anti-detection measures to a Puppeteer page
 * @param {import('puppeteer').Page} page
 */
async function enhancePage(page) {
  // Random UA
  await page.setUserAgent(getRandomUA());

  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  });

  // Override navigator properties to avoid detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'zh-CN'] });

    // Override chrome runtime
    window.chrome = { runtime: {} };
  });
}

// ── Axios Request Wrapper ────────────────────────────────────────────────────

const axios = require('axios');

/**
 * Make an HTTP request with anti-detection headers and retry
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function safeRequest(url, options = {}) {
  const {
    maxRetries = 3,
    timeout = 30000,
    referer = '',
    source = '',
    ...axiosOptions
  } = options;

  return retryWithBackoff(
    async () => {
      const response = await axios.get(url, {
        headers: getBrowserHeaders(referer),
        timeout,
        ...axiosOptions,
      });

      const validation = validateResponse(response, source);
      if (!validation.valid) {
        throw new Error(`Response validation failed: ${validation.issue}`);
      }

      return response;
    },
    {
      maxRetries,
      label: source || url.split('/')[2],
      shouldRetry: (err) => {
        const status = err.response?.status;
        if (status === 403 || status === 404) return false; // Don't retry these
        return true;
      },
    },
  );
}

module.exports = {
  getRandomUA,
  getBrowserHeaders,
  delayWithJitter,
  retryWithBackoff,
  validateResponse,
  generateDOMFingerprint,
  checkDOMChange,
  enhancePage,
  safeRequest,
  UA_POOL,
};
