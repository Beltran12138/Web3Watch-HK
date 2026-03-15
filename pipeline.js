'use strict';
/**
 * pipeline.js — Event-driven pipeline architecture
 *
 * Provides a message-bus / pipeline abstraction for decoupled data flow:
 *   Scrape → Filter → Classify → Push → Store
 *
 * Benefits:
 * - Decoupled stages: each stage can be developed, tested, and scaled independently
 * - Observable: monitoring hooks at every stage
 * - Resilient: stage-level error isolation
 * - Extensible: add new stages (e.g., sentiment analysis) without modifying existing ones
 */

const EventEmitter = require('events');

/**
 * @typedef {Object} PipelineItem
 * @property {string} id - Unique item identifier
 * @property {object} data - The news item data
 * @property {object} meta - Pipeline metadata (stage timing, errors, etc.)
 */

class Pipeline extends EventEmitter {
  constructor(name = 'default') {
    super();
    this.name = name;
    /** @type {Array<{ name: string, handler: Function, options: object }>} */
    this.stages = [];
    /** @type {{ total: number, completed: number, failed: number, byStage: Map<string, { processed: number, errors: number, avgMs: number }> }} */
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      byStage: new Map(),
    };
  }

  /**
   * Register a processing stage
   * @param {string} name - Stage name
   * @param {(items: Array, context: object) => Promise<Array>} handler - Processing function
   * @param {object} [options]
   * @param {boolean} [options.continueOnError=true] - Whether to continue pipeline on stage error
   * @param {number} [options.timeoutMs=60000] - Stage timeout
   */
  addStage(name, handler, options = {}) {
    this.stages.push({
      name,
      handler,
      options: {
        continueOnError: true,
        timeoutMs: 60000,
        ...options,
      },
    });

    this.stats.byStage.set(name, { processed: 0, errors: 0, totalMs: 0, avgMs: 0 });
    return this; // Allow chaining
  }

  /**
   * Execute the pipeline with input items
   * @param {Array} items - Input items to process
   * @param {object} [context] - Shared context across stages
   * @returns {Promise<{ items: Array, stats: object, errors: Array }>}
   */
  async execute(items, context = {}) {
    const runId = `${this.name}-${Date.now()}`;
    const startTime = Date.now();
    const errors = [];
    let currentItems = [...items];

    this.stats.total++;
    this.emit('pipeline:start', { runId, itemCount: items.length, context });

    for (const stage of this.stages) {
      const stageStart = Date.now();
      const stageStats = this.stats.byStage.get(stage.name);

      try {
        this.emit('stage:start', { runId, stage: stage.name, itemCount: currentItems.length });

        // Execute with timeout
        const result = await this._executeWithTimeout(
          stage.handler(currentItems, context),
          stage.options.timeoutMs,
          stage.name
        );

        currentItems = Array.isArray(result) ? result : currentItems;

        const stageMs = Date.now() - stageStart;
        stageStats.processed += currentItems.length;
        stageStats.totalMs += stageMs;
        stageStats.avgMs = Math.round(stageStats.totalMs / Math.max(1, stageStats.processed));

        this.emit('stage:complete', {
          runId,
          stage: stage.name,
          itemCount: currentItems.length,
          durationMs: stageMs,
        });

      } catch (err) {
        const stageMs = Date.now() - stageStart;
        stageStats.errors++;

        const stageError = {
          stage: stage.name,
          error: err.message,
          durationMs: stageMs,
        };
        errors.push(stageError);

        this.emit('stage:error', { runId, ...stageError });

        if (!stage.options.continueOnError) {
          this.stats.failed++;
          this.emit('pipeline:error', { runId, stage: stage.name, error: err.message });
          return { items: currentItems, stats: this._getRunStats(startTime), errors };
        }
      }
    }

    this.stats.completed++;
    const runStats = this._getRunStats(startTime);

    this.emit('pipeline:complete', { runId, itemCount: currentItems.length, stats: runStats });

    return { items: currentItems, stats: runStats, errors };
  }

  /**
   * Execute a promise with timeout
   * @private
   */
  async _executeWithTimeout(promise, timeoutMs, stageName) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Stage "${stageName}" timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Get run statistics
   * @private
   */
  _getRunStats(startTime) {
    const stageStats = {};
    for (const [name, stats] of this.stats.byStage) {
      stageStats[name] = { ...stats };
    }

    return {
      totalRuns: this.stats.total,
      completed: this.stats.completed,
      failed: this.stats.failed,
      lastRunMs: Date.now() - startTime,
      stages: stageStats,
    };
  }

  /**
   * Get current pipeline stats
   */
  getStats() {
    return this._getRunStats(0);
  }

  /**
   * Reset pipeline stats
   */
  resetStats() {
    this.stats.total = 0;
    this.stats.completed = 0;
    this.stats.failed = 0;
    for (const [, stats] of this.stats.byStage) {
      stats.processed = 0;
      stats.errors = 0;
      stats.totalMs = 0;
      stats.avgMs = 0;
    }
  }
}

// ── Pre-built stages ─────────────────────────────────────────────────────────

/**
 * Create filter stage
 */
function createFilterStage(filterFn) {
  return async (items, context) => {
    const before = items.length;
    const filtered = filterFn(items);
    console.log(`[Pipeline:Filter] ${before} → ${filtered.length} items`);
    context.filterStats = { before, after: filtered.length, removed: before - filtered.length };
    return filtered;
  };
}

/**
 * Create AI classification stage
 */
function createClassifyStage(classifyFn, options = {}) {
  const { batchSize = 10, maxItems = 60 } = options;

  return async (items, context) => {
    const toClassify = items.slice(0, maxItems);
    let classified = 0;

    for (let i = 0; i < toClassify.length; i += batchSize) {
      const batch = toClassify.slice(i, i + batchSize);
      try {
        const results = await classifyFn(batch);
        if (results instanceof Map) {
          results.forEach((result, idx) => {
            Object.assign(items[i + idx], result);
            classified++;
          });
        }
      } catch (err) {
        console.warn(`[Pipeline:Classify] Batch ${Math.floor(i / batchSize) + 1} error:`, err.message);
      }
    }

    context.classifyStats = { total: items.length, classified };
    return items;
  };
}

/**
 * Create storage stage
 */
function createStorageStage(saveFn) {
  return async (items, context) => {
    await saveFn(items);
    context.storageStats = { saved: items.length };
    return items;
  };
}

/**
 * Create push notification stage
 */
function createPushStage(pushFn, filterFn) {
  return async (items, context) => {
    const toPush = filterFn ? items.filter(filterFn) : items.filter(i => i.is_important === 1);
    let pushed = 0;

    for (const item of toPush) {
      try {
        await pushFn(item);
        pushed++;
      } catch (err) {
        console.warn(`[Pipeline:Push] Failed to push:`, err.message);
      }
    }

    context.pushStats = { total: toPush.length, pushed };
    return items;
  };
}

// ── Query Cache ──────────────────────────────────────────────────────────────

class QueryCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs=60000] - Cache TTL in milliseconds
   * @param {number} [options.maxEntries=100] - Maximum cache entries
   */
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 60000;
    this.maxEntries = options.maxEntries || 100;
    /** @type {Map<string, { data: any, ts: number }>} */
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cached result or execute query
   * @param {string} key - Cache key
   * @param {Function} queryFn - Function to execute on cache miss
   * @returns {Promise<any>}
   */
  async getOrSet(key, queryFn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.ttlMs) {
      this.stats.hits++;
      return cached.data;
    }

    this.stats.misses++;
    const data = await queryFn();
    this.set(key, data);
    return data;
  }

  /**
   * Set a cache entry
   */
  set(key, data) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, ts: Date.now() });
  }

  /**
   * Invalidate cache entry or all entries
   */
  invalidate(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : 'N/A',
      size: this.cache.size,
      maxEntries: this.maxEntries,
    };
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

const queryCache = new QueryCache({ ttlMs: 60000, maxEntries: 200 });

module.exports = {
  Pipeline,
  QueryCache,
  queryCache,
  createFilterStage,
  createClassifyStage,
  createStorageStage,
  createPushStage,
};
