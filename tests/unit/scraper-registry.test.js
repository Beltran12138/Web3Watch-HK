'use strict';

const { ScraperRegistry } = require('../../lib/scraper-registry');

describe('ScraperRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ScraperRegistry();
  });

  describe('registration', () => {
    it('should register a scraper', () => {
      const scraperFn = jest.fn().mockResolvedValue([]);
      registry.register('test-source', scraperFn, { tier: 'high' });

      const scraper = registry.get('test-source');
      expect(scraper).toBeDefined();
      expect(scraper.name).toBe('test-source');
      expect(scraper.config.tier).toBe('high');
    });

    it('should throw for non-function scraper', () => {
      expect(() => {
        registry.register('invalid', 'not-a-function');
      }).toThrow('Scraper invalid must be a function');
    });

    it('should unregister a scraper', () => {
      registry.register('test', jest.fn());
      expect(registry.get('test')).toBeDefined();

      const result = registry.unregister('test');
      expect(result).toBe(true);
      expect(registry.get('test')).toBeUndefined();
    });

    it('should apply default config', () => {
      registry.register('test', jest.fn());
      const scraper = registry.get('test');

      expect(scraper.config.tier).toBe('low');
      expect(scraper.config.maxAgeHours).toBe(48);
      expect(scraper.config.dedupMode).toBe('normal');
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      registry.register('source1', jest.fn(), { tier: 'high' });
      registry.register('source2', jest.fn(), { tier: 'high' });
      registry.register('source3', jest.fn(), { tier: 'low' });
      registry.register('source4', jest.fn(), { tier: 'low', disabled: true });
    });

    it('should get all scrapers', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(4);
    });

    it('should get scrapers by tier', () => {
      const high = registry.getByTier('high');
      expect(high).toHaveLength(2);
      expect(high.map(s => s.name)).toContain('source1');
      expect(high.map(s => s.name)).toContain('source2');
    });

    it('should exclude disabled scrapers from getByTier', () => {
      const low = registry.getByTier('low');
      expect(low).toHaveLength(1);
      expect(low[0].name).toBe('source3');
    });

    it('should get enabled scrapers', () => {
      const enabled = registry.getEnabled();
      expect(enabled).toHaveLength(3);
    });
  });

  describe('execution', () => {
    it('should execute scraper successfully', async () => {
      const mockData = [{ title: 'Test' }];
      registry.register('test', jest.fn().mockResolvedValue(mockData));

      const result = await registry.execute('test');
      expect(result).toEqual(mockData);
    });

    it('should throw for non-existent scraper', async () => {
      await expect(registry.execute('non-existent')).rejects.toThrow('Scraper non-existent not found');
    });

    it('should throw for disabled scraper', async () => {
      registry.register('disabled', jest.fn(), { disabled: true });
      await expect(registry.execute('disabled')).rejects.toThrow('Scraper disabled is disabled');
    });

    it('should update stats on success', async () => {
      registry.register('test', jest.fn().mockResolvedValue([]));
      await registry.execute('test');

      const stats = registry.get('test').stats;
      expect(stats.totalRuns).toBe(1);
      expect(stats.successfulRuns).toBe(1);
      expect(stats.failedRuns).toBe(0);
    });

    it('should update stats on failure', async () => {
      registry.register('test', jest.fn().mockRejectedValue(new Error('fail')));

      await expect(registry.execute('test')).rejects.toThrow('fail');

      const stats = registry.get('test').stats;
      expect(stats.totalRuns).toBe(1);
      expect(stats.successfulRuns).toBe(0);
      expect(stats.failedRuns).toBe(1);
      expect(stats.lastError).toBe('fail');
    });
  });

  describe('batch execution', () => {
    it('should execute by tier with concurrency', async () => {
      registry.register('s1', jest.fn().mockResolvedValue([1]), { tier: 'high' });
      registry.register('s2', jest.fn().mockResolvedValue([2]), { tier: 'high' });
      registry.register('s3', jest.fn().mockResolvedValue([3]), { tier: 'low' });

      const result = await registry.executeByTier('high', { concurrency: 2 });

      expect(result.results).toHaveLength(2);
      expect(result.stats.total).toBe(2);
      expect(result.stats.success).toBe(2);
    });

    it('should handle errors in batch execution', async () => {
      registry.register('s1', jest.fn().mockResolvedValue([1]), { tier: 'high' });
      registry.register('s2', jest.fn().mockRejectedValue(new Error('fail')), { tier: 'high' });

      const result = await registry.executeByTier('high');

      expect(result.results).toHaveLength(1);
      expect(result.stats.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('disable/enable', () => {
    it('should disable scraper', () => {
      registry.register('test', jest.fn());
      registry.setDisabled('test', true);

      expect(registry.get('test').config.disabled).toBe(true);
    });

    it('should enable scraper', () => {
      registry.register('test', jest.fn(), { disabled: true });
      registry.setDisabled('test', false);

      expect(registry.get('test').config.disabled).toBe(false);
    });
  });
});
