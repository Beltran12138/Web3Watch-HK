'use strict';
/**
 * tests/unit/alert-manager.test.js — AlertManager unit tests
 */

const { AlertManager } = require('../../monitoring/alert-manager');

describe('AlertManager', () => {
  let manager;

  beforeEach(() => {
    manager = new AlertManager({
      scraperFailThreshold: 3,
      alertCooldownMs: 1000,
    });
  });

  afterEach(() => {
    manager.reset();
  });

  describe('logging', () => {
    test('stores log entries', () => {
      manager.log('info', 'test', 'Hello');
      manager.log('warn', 'test', 'Warning');
      expect(manager.logs).toHaveLength(2);
    });

    test('trims log buffer at maxLogEntries', () => {
      const m = new AlertManager({ maxLogEntries: 5 });
      for (let i = 0; i < 10; i++) {
        m.log('info', 'test', `Log ${i}`);
      }
      expect(m.logs.length).toBeLessThanOrEqual(5);
    });

    test('emits log event', () => {
      const entries = [];
      manager.on('log', (entry) => entries.push(entry));
      manager.log('info', 'test', 'Event test');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Event test');
    });
  });

  describe('scraper monitoring', () => {
    test('tracks scraper success', () => {
      manager.recordScraperResult('Binance', true, 10);
      const status = manager.scraperStatus.get('Binance');
      expect(status.successCount).toBe(1);
      expect(status.totalItems).toBe(10);
      expect(status.consecutive).toBe(0);
    });

    test('tracks consecutive failures', () => {
      manager.recordScraperResult('OKX', false, 0, 'timeout');
      manager.recordScraperResult('OKX', false, 0, 'timeout');
      const status = manager.scraperStatus.get('OKX');
      expect(status.consecutive).toBe(2);
      expect(status.failCount).toBe(2);
    });

    test('resets consecutive on success', () => {
      manager.recordScraperResult('Gate', false, 0, 'error');
      manager.recordScraperResult('Gate', false, 0, 'error');
      manager.recordScraperResult('Gate', true, 5);
      const status = manager.scraperStatus.get('Gate');
      expect(status.consecutive).toBe(0);
    });

    test('emits alert on threshold breach', () => {
      const alerts = [];
      manager.on('alert', (a) => alerts.push(a));
      manager.recordScraperResult('SFC', false, 0, 'err1');
      manager.recordScraperResult('SFC', false, 0, 'err2');
      manager.recordScraperResult('SFC', false, 0, 'err3');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('AI provider monitoring', () => {
    test('records degradation', () => {
      manager.recordAIDegradation('deepseek', 'openrouter', 'rate limit');
      expect(manager.aiProviderState.current).toBe('openrouter');
      expect(manager.aiProviderState.degradedAt).toBeTruthy();
      expect(manager.aiProviderState.history).toHaveLength(1);
    });

    test('records recovery', () => {
      manager.recordAIDegradation('deepseek', 'rule_engine', 'all failed');
      manager.recordAIRecovery('deepseek');
      expect(manager.aiProviderState.current).toBe('deepseek');
      expect(manager.aiProviderState.degradedAt).toBeNull();
    });
  });

  describe('source health', () => {
    test('tracks source health', () => {
      manager.updateSourceHealth('Binance', 10);
      const health = manager.sourceHealth.get('Binance');
      expect(health.totalCount).toBe(10);
      expect(health.lastSeen).toBeGreaterThan(0);
    });

    test('detects stale sources', () => {
      manager.updateSourceHealth('Stale', 5);
      // Manually set lastSeen to 5 hours ago
      manager.sourceHealth.get('Stale').lastSeen = Date.now() - 5 * 3600000;
      const stale = manager.checkStaleSources(4 * 3600000);
      expect(stale).toHaveLength(1);
      expect(stale[0].source).toBe('Stale');
    });
  });

  describe('status reporting', () => {
    test('returns comprehensive status', () => {
      manager.recordScraperResult('Binance', true, 10);
      manager.recordAIDegradation('deepseek', 'openrouter', 'test');
      manager.log('error', 'test', 'Test error');

      const status = manager.getStatus();
      expect(status.scrapers).toBeTruthy();
      expect(status.ai.current).toBe('openrouter');
      expect(status.recentErrors).toHaveLength(1);
    });
  });

  describe('digest generation', () => {
    test('generates markdown digest', () => {
      manager.recordScraperResult('Binance', true, 10);
      manager.recordScraperResult('OKX', false, 0, 'error');
      manager.log('error', 'test', 'Test error');

      const digest = manager.generateDigest();
      expect(digest).toContain('Alpha-Radar');
      expect(digest).toContain('Binance');
    });
  });

  describe('push function', () => {
    test('calls push function on critical log', async () => {
      const pushed = [];
      manager.setPushFunction(async (msg) => pushed.push(msg));
      manager.log('critical', 'test', 'Critical error');

      // Allow async push to complete
      await new Promise(r => setTimeout(r, 100));
      expect(pushed.length).toBe(1);
    });
  });
});
