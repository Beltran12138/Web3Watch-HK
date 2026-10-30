'use strict';
/**
 * lib/flash.js — FLASH（安全突发）推送的事件折叠
 *
 * 同一实体 6 小时内只推第一条；窗口内的后续条目先挂起，窗口结束后合并成一条「事件更新」。
 * 状态存在 source_tracking 表（source = 'FLASH:<实体>'，last_pushed_timestamp = 首推时间，
 * last_pushed_title = JSON 状态），GitHub runner 每轮清空内存也不会丢。
 */

const { titleEntity } = require('./entities');

const FLASH_WINDOW_MS = 6 * 60 * 60 * 1000;
const KEY_PREFIX      = 'FLASH:';
const MAX_PENDING     = 20;

/** 折叠键：标题点名的实体；只有香港语境、没点名机构的归到「香港」 */
function flashEntity(title) {
  return titleEntity(title) || '香港';
}

function parseState(row) {
  try {
    const s = JSON.parse(row.last_pushed_title || '{}');
    return {
      start: Number(row.last_pushed_timestamp) || 0,
      title: s.title || '',
      digested: !!s.digested,
      pending: Array.isArray(s.pending) ? s.pending : [],
    };
  } catch (_) {
    return { start: Number(row.last_pushed_timestamp) || 0, title: '', digested: true, pending: [] };
  }
}

/** source_tracking 全表 → Map<实体, 状态> */
function loadFlashEvents(rows) {
  const events = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.source !== 'string' || !row.source.startsWith(KEY_PREFIX)) continue;
    events.set(row.source.slice(KEY_PREFIX.length), parseState(row));
  }
  return events;
}

/** 状态 → updateSourcePush(source, timestamp, title) 的参数 */
function serializeEvent(entity, state) {
  return [
    KEY_PREFIX + entity,
    state.start,
    JSON.stringify({ title: state.title, digested: state.digested, pending: state.pending }),
  ];
}

/**
 * 决定一条 FLASH 条目怎么处理（会改写 events）
 * @returns {{action: 'push'|'fold'|'skip', entity: string, flush: object|null}}
 *   push = 作为新事件首条推送；fold = 挂到窗口内等合并；
 *   skip = 发布已超过 6 小时、又没有进行中的同实体事件（旧闻不当突发推）；
 *   flush = 上一个已过期、还没发过「事件更新」的窗口，调用方需先把它发掉
 */
function decideFlash(events, item, now = Date.now()) {
  const entity = flashEntity(item.title);
  const cur    = events.get(entity);
  const active = cur && now - cur.start < FLASH_WINDOW_MS;

  if (!active && item.timestamp && now - item.timestamp > FLASH_WINDOW_MS) {
    return { action: 'skip', entity, flush: null };
  }

  if (active) {
    if (cur.pending.length < MAX_PENDING) {
      cur.pending.push({ title: (item.title || '').slice(0, 120), source: item.source || '', url: item.url || '' });
    }
    cur.digested = false;
    return { action: 'fold', entity, flush: null };
  }

  const flush = cur && !cur.digested && cur.pending.length ? { entity, ...cur } : null;
  events.set(entity, { start: now, title: (item.title || '').slice(0, 120), digested: true, pending: [] });
  return { action: 'push', entity, flush };
}

/** 窗口已结束、有挂起条目、还没发过「事件更新」的事件 */
function dueDigests(events, now = Date.now()) {
  const due = [];
  for (const [entity, s] of events) {
    if (!s.digested && s.pending.length && now - s.start >= FLASH_WINDOW_MS) due.push({ entity, ...s });
  }
  return due;
}

module.exports = {
  FLASH_WINDOW_MS, KEY_PREFIX, flashEntity, loadFlashEvents, serializeEvent, decideFlash, dueDigests,
};
