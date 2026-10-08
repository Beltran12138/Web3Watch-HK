'use strict';
/**
 * tests/unit/db-supabase.test.js — db.js / dao.js 在 GitHub Actions（USE_SUPABASE=true）下的读写路径。
 *
 * CI runner 上 SQLite 每轮都是空库，所以这些路径不能碰 SQLite：去重 / 已推送 / 冷却 / 行业记忆全部读 Supabase。
 * Supabase 用内存假客户端代替（无网络），better-sqlite3 被 mock 成「一加载就报错」，确保根本没打开 SQLite。
 */

// ── 假 Supabase 客户端：记录每次查询的链式调用，按 handler 返回结果 ─────────────────────
function makeFakeSupabase(handler) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const builder = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lt', 'order', 'limit', 'maybeSingle', 'or', 'upsert', 'update']) {
        builder[m] = (...args) => { q.ops.push([m, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => Promise.resolve(handler(q)).then(resolve, reject);
      return builder;
    },
  };
  return client;
}

const op = (q, name) => q.ops.find(o => o[0] === name);
const ops = (q, name) => q.ops.filter(o => o[0] === name);

function loadDbWith(env, handler) {
  const saved = {};
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  Object.assign(process.env, env);
  const fake = makeFakeSupabase(handler || (() => ({ data: null, error: null })));
  let mods;
  jest.isolateModules(() => {
    jest.doMock('@supabase/supabase-js', () => ({ createClient: () => fake }));
    jest.doMock('better-sqlite3', () => { throw new Error('better-sqlite3 must not be loaded in CI'); });
    jest.doMock('dotenv', () => ({ config: () => ({}) }));
    mods = { db: require('../../db'), dao: require('../../dao') };
  });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return { ...mods, fake };
}

const CI_ENV = { GITHUB_ACTIONS: 'true', USE_SUPABASE: 'true', SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_KEY: 'fake' };

let errSpy, logSpy, warnSpy;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { errSpy.mockRestore(); logSpy.mockRestore(); warnSpy.mockRestore(); });

describe('GitHub Actions + USE_SUPABASE=true', () => {
  test('SQLite is not opened', () => {
    const { db } = loadDbWith(CI_ENV);
    expect(db.SQLITE_ENABLED).toBe(false);
    expect(db.SUPABASE_ACTIVE).toBe(true);
    expect(db.db).toBeNull();
    expect(db.STMT).toBeNull();
  });

  test('canPushMessage reads source_tracking from Supabase (cooldown triggers on same title)', async () => {
    const lastTs = Date.now() - 3600 * 1000;
    const { db, fake } = loadDbWith(CI_ENV, q => {
      if (q.table === 'source_tracking') {
        return { data: { last_pushed_timestamp: lastTs, last_pushed_title: 'SFC issues new circular (Updated)' }, error: null };
      }
      return { data: null, error: null };
    });
    expect(await db.canPushMessage('SFC', 'SFC issues new circular', Date.now(), 48)).toBe(false);
    expect(await db.canPushMessage('SFC', 'A different headline entirely', Date.now(), 48)).toBe(true);
    expect(await db.canPushMessage('SFC', 'SFC issues new circular', Date.now(), 0.5)).toBe(true); // 冷却期已过
    const st = fake.calls.filter(q => q.table === 'source_tracking');
    expect(st.length).toBeGreaterThan(0);
    expect(op(st[0], 'eq')).toEqual(['eq', 'source', 'SFC']);
  });

  test('canPushMessage: never pushed → allowed', async () => {
    const { db } = loadDbWith(CI_ENV, () => ({ data: null, error: null }));
    expect(await db.canPushMessage('OSL', 'x', Date.now(), 24)).toBe(true);
  });

  test('updateSourcePush upserts source_tracking on source', async () => {
    const { db, fake } = loadDbWith(CI_ENV, () => ({ data: null, error: null }));
    await db.updateSourcePush('OSL', 123, 'title');
    const q = fake.calls.find(c => c.table === 'source_tracking');
    const up = op(q, 'upsert');
    expect(up[1]).toMatchObject({ source: 'OSL', last_pushed_timestamp: 123, last_pushed_title: 'title' });
    expect(up[2]).toEqual({ onConflict: 'source' });
  });

  test('getAlreadyProcessed reads news from Supabase', async () => {
    const items = [
      { title: 'HashKey gets licence', source: 'HashKeyGroup', url: 'https://a/1' },
      { title: 'Fresh item', source: 'OSL', url: 'https://a/2' },
    ];
    const { db, fake } = loadDbWith(CI_ENV, q => {
      if (q.table === 'news' && op(q, 'in') && op(q, 'in')[1] === 'url') {
        return { data: [{ url: 'https://a/1', title: 'HashKey gets licence', source: 'HashKeyGroup',
          business_category: '合规', sent_to_wecom: 1, timestamp: 1000 }], error: null };
      }
      return { data: [], error: null };
    });
    const { processed, sentToWeCom, existingTimestamps } = await db.getAlreadyProcessed(items);
    expect(processed.has('https://a/1')).toBe(true);
    expect(sentToWeCom.has('https://a/1')).toBe(true);
    expect(existingTimestamps.get('https://a/1')).toBe(1000);
    expect(processed.has('https://a/2')).toBe(false);
    // 第二轮按 title 查 URL 没命中的
    const byTitle = fake.calls.find(q => q.table === 'news' && op(q, 'in') && op(q, 'in')[1] === 'title');
    expect(byTitle && op(byTitle, 'in')[2]).toEqual(['Fresh item']);
  });

  test('checkIfSent reads news from Supabase', async () => {
    const { db } = loadDbWith(CI_ENV, q => {
      const urlEq = ops(q, 'eq').find(o => o[1] === 'url');
      return { data: urlEq && urlEq[2] === 'https://sent' ? { sent_to_wecom: 1 } : null, error: null };
    });
    expect(await db.checkIfSent('https://sent', 'x')).toBe(true);
    expect(await db.checkIfSent('https://new', 'y')).toBe(false);
  });

  test('updateSentStatus only flips sent_to_wecom (does not wipe AI fields)', async () => {
    const { db, fake } = loadDbWith(CI_ENV, () => ({ data: null, error: null }));
    await db.updateSentStatus({ title: 't', source: 'OSL', url: 'https://u' });
    const q = fake.calls.find(c => c.table === 'news');
    expect(op(q, 'upsert')).toBeUndefined();
    expect(op(q, 'update')).toEqual(['update', { sent_to_wecom: 1 }]);
    expect(op(q, 'eq')).toEqual(['eq', 'url', 'https://u']);

    fake.calls.length = 0;
    await db.updateSentStatus({ title: 'no url', source: 'OSL' });
    expect(fake.calls).toHaveLength(0);
  });

  test('saveNews writes only Supabase and keeps AI fields out when empty', async () => {
    const { db, fake } = loadDbWith(CI_ENV, () => ({ data: null, error: null }));
    await db.saveNews([{ title: 'Re-scraped', source: 'OSL', url: 'https://r', timestamp: 5 }]);
    const q = fake.calls.find(c => c.table === 'news');
    const row = op(q, 'upsert')[1][0];
    expect(row).toMatchObject({ title: 'Re-scraped', url: 'https://r' });
    expect(row).not.toHaveProperty('business_category');
    expect(row).not.toHaveProperty('detail');
  });

  test('getNewsInRange queries Supabase with the window / score / order', async () => {
    const { db, fake } = loadDbWith(CI_ENV, () => ({ data: [{ id: 1 }], error: null }));
    const rows = await db.getNewsInRange({ since: 100, until: 200, minScore: 85, orderBy: 'alpha_score', limit: 20 });
    expect(rows).toEqual([{ id: 1 }]);
    const q = fake.calls[0];
    expect(ops(q, 'gte')).toEqual([['gte', 'timestamp', 100], ['gte', 'alpha_score', 85]]);
    expect(op(q, 'lt')).toEqual(['lt', 'timestamp', 200]);
    expect(ops(q, 'order').map(o => o[1])).toEqual(['alpha_score', 'timestamp']);
    expect(op(q, 'limit')).toEqual(['limit', 20]);
  });

  test('getNewsInRange surfaces Supabase errors', async () => {
    const { db } = loadDbWith(CI_ENV, () => ({ data: null, error: { message: 'boom' } }));
    await expect(db.getNewsInRange({ since: 0 })).rejects.toThrow('boom');
  });

  test('insightDAO reads / writes insights in Supabase only', async () => {
    const { dao, fake } = loadDbWith(CI_ENV, q => {
      if (q.table === 'insights' && op(q, 'select')) return { data: [{ trend_key: 'k' }], error: null };
      return { data: null, error: null };
    });
    expect(await dao.insightDAO.getRecent(3)).toEqual([{ trend_key: 'k' }]);
    await dao.insightDAO.saveInsight({ trend_key: 'k2', summary: 's' });
    const up = fake.calls.find(q => q.table === 'insights' && op(q, 'upsert'));
    expect(up && op(up, 'upsert')[2]).toEqual({ onConflict: 'trend_key' });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('STMT.insertInsight not ready'));
  });
});

describe('GitHub Actions without Supabase', () => {
  test('dedup / cooldown lookups fail loudly instead of treating everything as new', async () => {
    const { db } = loadDbWith({ GITHUB_ACTIONS: 'true', USE_SUPABASE: 'false' });
    expect(db.db).toBeNull();
    await expect(db.getAlreadyProcessed([{ title: 't', source: 's', url: 'u' }])).rejects.toThrow('no storage backend');
    await expect(db.canPushMessage('s', 't', Date.now(), 24)).rejects.toThrow('no storage backend');
    await expect(db.checkIfSent('u', 't')).rejects.toThrow('no storage backend');
  });

  test('pure helpers still work', () => {
    const { db } = loadDbWith({ GITHUB_ACTIONS: 'true', USE_SUPABASE: 'false' });
    expect(db.normalizeKey('Hello World!', 'SFC')).toBe('helloworld|sfc');
  });
});
