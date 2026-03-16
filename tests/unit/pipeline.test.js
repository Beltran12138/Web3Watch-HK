'use strict';
/**
 * tests/unit/pipeline.test.js — Pipeline & QueryCache unit tests
 */

const { Pipeline, QueryCache } = require('../../pipeline');

describe('Pipeline', () => {
  test('executes stages in order', async () => {
    const pipeline = new Pipeline('test');
    const order = [];

    pipeline.addStage('stage1', async (items) => {
      order.push('stage1');
      return items.map(i => ({ ...i, stage1: true }));
    });

    pipeline.addStage('stage2', async (items) => {
      order.push('stage2');
      return items.map(i => ({ ...i, stage2: true }));
    });

    const result = await pipeline.execute([{ id: 1 }]);
    expect(order).toEqual(['stage1', 'stage2']);
    expect(result.items[0].stage1).toBe(true);
    expect(result.items[0].stage2).toBe(true);
  });

  test('continues on error when continueOnError=true', async () => {
    const pipeline = new Pipeline('test');

    pipeline.addStage('failing', async () => {
      throw new Error('Stage failed');
    }, { continueOnError: true });

    pipeline.addStage('succeeding', async (items) => items.map(i => ({ ...i, processed: true })));

    const result = await pipeline.execute([{ id: 1 }]);
    expect(result.errors).toHaveLength(1);
    expect(result.items[0].processed).toBe(true);
  });

  test('stops on error when continueOnError=false', async () => {
    const pipeline = new Pipeline('test');

    pipeline.addStage('failing', async () => {
      throw new Error('Fatal');
    }, { continueOnError: false });

    pipeline.addStage('never-reached', async (items) => items.map(i => ({ ...i, reached: true })));

    const result = await pipeline.execute([{ id: 1 }]);
    expect(result.errors).toHaveLength(1);
    expect(result.items[0].reached).toBeUndefined();
  });

  test('respects stage timeout', async () => {
    const pipeline = new Pipeline('test');

    pipeline.addStage('slow', async () => {
      await new Promise(r => setTimeout(r, 5000));
      return [];
    }, { timeoutMs: 100, continueOnError: true });

    const result = await pipeline.execute([{ id: 1 }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('timed out');
  });

  test('emits lifecycle events', async () => {
    const pipeline = new Pipeline('test');
    const events = [];

    pipeline.addStage('stage1', async (items) => items);

    pipeline.on('pipeline:start', () => events.push('start'));
    pipeline.on('stage:start', () => events.push('stage-start'));
    pipeline.on('stage:complete', () => events.push('stage-complete'));
    pipeline.on('pipeline:complete', () => events.push('complete'));

    await pipeline.execute([{ id: 1 }]);
    expect(events).toEqual(['start', 'stage-start', 'stage-complete', 'complete']);
  });

  test('tracks statistics', async () => {
    const pipeline = new Pipeline('test');
    pipeline.addStage('stage1', async (items) => items);

    await pipeline.execute([{ id: 1 }]);
    await pipeline.execute([{ id: 2 }, { id: 3 }]);

    const stats = pipeline.getStats();
    expect(stats.totalRuns).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.stages.stage1.processed).toBeGreaterThan(0);
  });

  test('supports method chaining', () => {
    const pipeline = new Pipeline('test');
    const result = pipeline
      .addStage('s1', async (i) => i)
      .addStage('s2', async (i) => i);
    expect(result).toBe(pipeline);
  });

  test('filter stage reduces items', async () => {
    const { createFilterStage } = require('../../pipeline');
    const pipeline = new Pipeline('test');

    pipeline.addStage('filter', createFilterStage(
      (items) => items.filter(i => i.value > 5),
    ));

    const result = await pipeline.execute([
      { value: 3 }, { value: 8 }, { value: 10 }, { value: 1 },
    ]);
    expect(result.items).toHaveLength(2);
  });
});

describe('QueryCache', () => {
  test('caches and returns results', async () => {
    const cache = new QueryCache({ ttlMs: 5000 });
    let callCount = 0;

    const result1 = await cache.getOrSet('key1', async () => {
      callCount++;
      return { data: 'hello' };
    });

    const result2 = await cache.getOrSet('key1', async () => {
      callCount++;
      return { data: 'world' };
    });

    expect(result1).toEqual({ data: 'hello' });
    expect(result2).toEqual({ data: 'hello' }); // Cached
    expect(callCount).toBe(1);
  });

  test('expires entries after TTL', async () => {
    const cache = new QueryCache({ ttlMs: 50 });
    let callCount = 0;

    await cache.getOrSet('key1', async () => { callCount++; return 'a'; });
    await new Promise(r => setTimeout(r, 100));
    await cache.getOrSet('key1', async () => { callCount++; return 'b'; });

    expect(callCount).toBe(2);
  });

  test('evicts oldest when at capacity', async () => {
    const cache = new QueryCache({ ttlMs: 60000, maxEntries: 3 });

    await cache.getOrSet('k1', async () => 'a');
    await cache.getOrSet('k2', async () => 'b');
    await cache.getOrSet('k3', async () => 'c');
    await cache.getOrSet('k4', async () => 'd'); // Should evict k1

    expect(cache.cache.size).toBe(3);
    expect(cache.cache.has('k1')).toBe(false);
  });

  test('invalidate clears specific key', () => {
    const cache = new QueryCache();
    cache.set('k1', 'data');
    cache.set('k2', 'data');
    cache.invalidate('k1');
    expect(cache.cache.has('k1')).toBe(false);
    expect(cache.cache.has('k2')).toBe(true);
  });

  test('invalidate without key clears all', () => {
    const cache = new QueryCache();
    cache.set('k1', 'data');
    cache.set('k2', 'data');
    cache.invalidate();
    expect(cache.cache.size).toBe(0);
  });

  test('tracks hit/miss stats', async () => {
    const cache = new QueryCache();
    await cache.getOrSet('k1', async () => 'a');
    await cache.getOrSet('k1', async () => 'b'); // hit
    await cache.getOrSet('k2', async () => 'c'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });
});
