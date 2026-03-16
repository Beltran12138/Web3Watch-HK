'use strict';
/**
 * tests/unit/middleware.test.js — Scraper middleware unit tests
 */

const {
  getRandomUA,
  getBrowserHeaders,
  delayWithJitter,
  retryWithBackoff,
  validateResponse,
  checkDOMChange,
  UA_POOL,
} = require('../../scrapers/middleware');

describe('getRandomUA', () => {
  test('returns a string from UA pool', () => {
    const ua = getRandomUA();
    expect(typeof ua).toBe('string');
    expect(UA_POOL).toContain(ua);
  });

  test('returns different UAs over multiple calls', () => {
    const uas = new Set();
    for (let i = 0; i < 50; i++) {
      uas.add(getRandomUA());
    }
    // Should have at least 2 different UAs in 50 tries
    expect(uas.size).toBeGreaterThan(1);
  });
});

describe('getBrowserHeaders', () => {
  test('returns standard browser headers', () => {
    const headers = getBrowserHeaders();
    expect(headers['User-Agent']).toBeTruthy();
    expect(headers['Accept']).toBeTruthy();
    expect(headers['Accept-Language']).toBeTruthy();
  });

  test('adds referer when provided', () => {
    const headers = getBrowserHeaders('https://example.com');
    expect(headers['Referer']).toBe('https://example.com');
    expect(headers['Sec-Fetch-Site']).toBe('same-origin');
  });
});

describe('delayWithJitter', () => {
  test('delays approximately the specified time', async () => {
    const start = Date.now();
    await delayWithJitter(100, 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(250);
  });
});

describe('retryWithBackoff', () => {
  test('returns on first success', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      return 'success';
    }, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  test('retries on failure', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'ok';
    }, { maxRetries: 3, baseDelayMs: 50 });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('throws after max retries', async () => {
    await expect(
      retryWithBackoff(async () => { throw new Error('always fail'); }, {
        maxRetries: 2, baseDelayMs: 50,
      }),
    ).rejects.toThrow('always fail');
  });

  test('respects shouldRetry', async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(async () => {
        attempts++;
        throw new Error('do not retry');
      }, {
        maxRetries: 3,
        baseDelayMs: 50,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('do not retry');

    expect(attempts).toBe(1);
  });
});

describe('validateResponse', () => {
  test('validates successful response', () => {
    const result = validateResponse({ status: 200, data: '<html><body>' + 'x'.repeat(200) + '</body></html>' });
    expect(result.valid).toBe(true);
  });

  test('detects 403 blocked', () => {
    const result = validateResponse({ status: 403, data: 'Forbidden' });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('403');
  });

  test('detects 429 rate limit', () => {
    const result = validateResponse({ status: 429, data: 'Too many requests' });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('429');
  });

  test('detects Cloudflare challenge', () => {
    const result = validateResponse({ status: 200, data: '<html>cf-browser-verification</html>' });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('Cloudflare');
  });

  test('detects CAPTCHA', () => {
    const result = validateResponse({ status: 200, data: '<html>Please solve the captcha</html>' });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('CAPTCHA');
  });

  test('detects null response', () => {
    const result = validateResponse(null);
    expect(result.valid).toBe(false);
  });
});

describe('checkDOMChange', () => {
  test('first call returns no change', () => {
    const html = '<html><head></head><body><div><p>Hello</p></div></body></html>';
    const result = checkDOMChange('test-source', html);
    expect(result.changed).toBe(false);
    expect(result.similarity).toBe(1.0);
  });

  test('same structure returns no change', () => {
    const html1 = '<html><head></head><body><div><p>Hello</p></div></body></html>';
    const html2 = '<html><head></head><body><div><p>World</p></div></body></html>';
    checkDOMChange('same-src', html1);
    const result = checkDOMChange('same-src', html2);
    expect(result.changed).toBe(false);
    expect(result.similarity).toBeGreaterThan(0.9);
  });

  test('different structure detects change', () => {
    const html1 = '<html><head></head><body><div><p>Hello</p></div></body></html>';
    const html2 = '<html><head></head><body><section><article><span>New</span><img/><table><tr><td>x</td></tr></table></article></section></body></html>';
    checkDOMChange('diff-src', html1);
    const result = checkDOMChange('diff-src', html2);
    // Similarity should be lower for very different structures
    expect(result.similarity).toBeLessThan(1.0);
  });
});
