/**
 * lib/flash.js — FLASH 事件折叠
 */

const {
  FLASH_WINDOW_MS, KEY_PREFIX, flashEntity, loadFlashEvents, serializeEvent, decideFlash, dueDigests,
} = require('../../lib/flash');

const T0 = Date.parse('2026-10-29T21:18:00Z');
const H  = 60 * 60 * 1000;
const item = (title, source = 'BlockBeats', url = '') => ({ title, source, url });

describe('flashEntity', () => {
  test.each([
    ['币安被盗 58 亿美元', 'Binance'],
    ['Binance黑客已完成抛售', 'Binance'],
    ['OSL平台遭异常转出', 'OSL'],
    ['火币HTX热钱包被盗', 'HTX'],
    ['香港某持牌平台遭黑客攻击', '香港'],
  ])('%s → %s', (title, entity) => {
    expect(flashEntity(title)).toBe(entity);
  });
});

describe('decideFlash', () => {
  test('first item of an entity is pushed, later ones within 6h are folded', () => {
    const ev = new Map();
    expect(decideFlash(ev, item('Binance热钱包疑似遭遇大额异常流出'), T0).action).toBe('push');
    expect(decideFlash(ev, item('币安被盗 58 亿美元'), T0 + 4 * H).action).toBe('fold');
    expect(decideFlash(ev, item('Binance被盗地址已撤销EIP-7702授权'), T0 + 5 * H).action).toBe('fold');
    expect(ev.get('Binance').pending.map(p => p.title)).toEqual(['币安被盗 58 亿美元', 'Binance被盗地址已撤销EIP-7702授权']);
  });

  test('different entities do not fold into each other', () => {
    const ev = new Map();
    expect(decideFlash(ev, item('Binance 被盗'), T0).action).toBe('push');
    expect(decideFlash(ev, item('Bybit 热钱包被盗'), T0 + H).action).toBe('push');
  });

  test('after the window a new item starts a new event and hands back the unsent digest', () => {
    const ev = new Map();
    decideFlash(ev, item('Binance 被盗'), T0);
    decideFlash(ev, item('币安被盗续报'), T0 + H);
    const r = decideFlash(ev, item('Binance 再次被盗'), T0 + FLASH_WINDOW_MS + H);
    expect(r.action).toBe('push');
    expect(r.flush.pending.map(p => p.title)).toEqual(['币安被盗续报']);
    expect(ev.get('Binance').pending).toEqual([]);
  });

  test('an item published over 6h ago is not pushed as breaking news, but still folds into a live event', () => {
    const ev = new Map();
    const old = { ...item('Binance 被盗'), timestamp: T0 - 7 * H };
    expect(decideFlash(ev, old, T0).action).toBe('skip');
    expect(ev.size).toBe(0);
    decideFlash(ev, { ...item('Binance 续报'), timestamp: T0 }, T0);
    expect(decideFlash(ev, { ...old }, T0 + H).action).toBe('fold');
  });

  test('no flush when nothing was folded', () => {
    const ev = new Map();
    decideFlash(ev, item('Binance 被盗'), T0);
    expect(decideFlash(ev, item('Binance 再次被盗'), T0 + 7 * H).flush).toBeNull();
  });
});

describe('dueDigests', () => {
  test('due only after the window closes, and only once', () => {
    const ev = new Map();
    decideFlash(ev, item('Binance 被盗'), T0);
    decideFlash(ev, item('币安被盗续报'), T0 + H);
    expect(dueDigests(ev, T0 + 5 * H)).toEqual([]);
    const due = dueDigests(ev, T0 + 6 * H);
    expect(due.map(d => d.entity)).toEqual(['Binance']);
    ev.get('Binance').digested = true;
    expect(dueDigests(ev, T0 + 7 * H)).toEqual([]);
  });
});

describe('persistence round trip', () => {
  test('serializeEvent → loadFlashEvents keeps state; other source_tracking rows are ignored', () => {
    const ev = new Map();
    decideFlash(ev, item('Binance 被盗'), T0);
    decideFlash(ev, item('币安被盗续报', 'TechFlow', 'https://x'), T0 + H);
    const [source, ts, title] = serializeEvent('Binance', ev.get('Binance'));
    expect(source).toBe(`${KEY_PREFIX}Binance`);
    const loaded = loadFlashEvents([
      { source, last_pushed_timestamp: ts, last_pushed_title: title },
      { source: 'Binance', last_pushed_timestamp: T0, last_pushed_title: 'Binance Will List X' },
    ]);
    expect([...loaded.keys()]).toEqual(['Binance']);
    expect(loaded.get('Binance')).toEqual(ev.get('Binance'));
  });

  test('a corrupt state row is treated as already digested', () => {
    const loaded = loadFlashEvents([{ source: `${KEY_PREFIX}OKX`, last_pushed_timestamp: T0, last_pushed_title: '{bad' }]);
    expect(loaded.get('OKX')).toMatchObject({ start: T0, digested: true, pending: [] });
  });
});
