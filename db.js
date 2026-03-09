'use strict';

const Database     = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path         = require('path');
const { DB }       = require('./config');
require('dotenv').config();

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

let supabase = null;
if (USE_SUPABASE) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

const db = new Database(path.join(__dirname, 'alpha_radar.db'));

// ── 归一化 key（用于模糊去重）─────────────────────────────────────────────────
function normalizeKey(title, source) {
  const normalized = (title || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_,.:;!?()\[\]{}"'\\/|@#$%^&*+=<>~`]+/g, '');
  return source ? `${normalized}|${source.trim().toLowerCase()}` : normalized;
}

// ── 建表 + 索引 ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    normalized_title TEXT,
    content TEXT,
    detail TEXT DEFAULT '',
    source TEXT NOT NULL,
    url TEXT UNIQUE,
    category TEXT,
    business_category TEXT DEFAULT '',
    competitor_category TEXT DEFAULT '',
    timestamp INTEGER,
    is_important INTEGER DEFAULT 0,
    sent_to_wecom INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_timestamp       ON news(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_source          ON news(source);
  CREATE INDEX IF NOT EXISTS idx_is_important    ON news(is_important);
  CREATE INDEX IF NOT EXISTS idx_business_cat    ON news(business_category);
  CREATE INDEX IF NOT EXISTS idx_sent_wecom      ON news(sent_to_wecom);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_title_source ON news(title, source);
`);

// ── 安全迁移（已有数据库补列）────────────────────────────────────────────────
const existingCols = db.prepare('PRAGMA table_info(news)').all().map(c => c.name);
const migrations = [
  ['detail',               "ALTER TABLE news ADD COLUMN detail TEXT DEFAULT ''"],
  ['business_category',    "ALTER TABLE news ADD COLUMN business_category TEXT DEFAULT ''"],
  ['competitor_category',  "ALTER TABLE news ADD COLUMN competitor_category TEXT DEFAULT ''"],
  ['sent_to_wecom',        'ALTER TABLE news ADD COLUMN sent_to_wecom INTEGER DEFAULT 0'],
  ['normalized_title',     "ALTER TABLE news ADD COLUMN normalized_title TEXT DEFAULT ''; CREATE INDEX IF NOT EXISTS idx_normalized_title ON news(normalized_title)"],
];
migrations.forEach(([col, sql]) => {
  if (!existingCols.includes(col)) { db.exec(sql); console.log(`[DB] Migrated: +${col}`); }
});

// ── 预编译 SQL（性能优化）────────────────────────────────────────────────────
const STMT = {
  insert: db.prepare(`
    INSERT INTO news
      (title, normalized_title, content, detail, source, url, category,
       business_category, competitor_category, timestamp, is_important, sent_to_wecom)
    VALUES
      (@title, @normalized_title, @content, @detail, @source, @url, @category,
       @business_category, @competitor_category, @timestamp, @is_important, @sent_to_wecom)
    ON CONFLICT(title, source) DO UPDATE SET
      url                 = CASE WHEN excluded.url != '' THEN excluded.url ELSE news.url END,
      normalized_title    = excluded.normalized_title,
      is_important        = MAX(news.is_important, excluded.is_important),
      sent_to_wecom       = MAX(news.sent_to_wecom, excluded.sent_to_wecom),
      business_category   = CASE WHEN excluded.business_category != '' THEN excluded.business_category ELSE news.business_category END,
      competitor_category = CASE WHEN excluded.competitor_category != '' THEN excluded.competitor_category ELSE news.competitor_category END,
      detail              = CASE WHEN excluded.detail != ''              THEN excluded.detail             ELSE news.detail END,
      timestamp           = news.timestamp,   -- 保留首次入库时间
      created_at          = news.created_at
  `),

  updateByUrl:   db.prepare('UPDATE news SET sent_to_wecom=1 WHERE url=?'),
  updateByTitle: db.prepare('UPDATE news SET sent_to_wecom=1 WHERE title=? AND source=?'),
  updateByNorm:  db.prepare('UPDATE news SET sent_to_wecom=1 WHERE normalized_title=?'),

  getByUrls:     (placeholders) => db.prepare(
    `SELECT url, title, normalized_title, source, business_category, sent_to_wecom, timestamp FROM news WHERE url IN (${placeholders})`
  ),
  getByNorm:     db.prepare(
    'SELECT url, sent_to_wecom, business_category, timestamp FROM news WHERE normalized_title=? ORDER BY sent_to_wecom DESC, timestamp DESC LIMIT 1'
  ),
  checkSent:     db.prepare(
    'SELECT sent_to_wecom FROM news WHERE (url=? OR normalized_title=?) AND sent_to_wecom=1 LIMIT 1'
  ),

  // 统计
  countAll:      db.prepare('SELECT COUNT(*) as n FROM news'),
  countImportant:db.prepare('SELECT COUNT(*) as n FROM news WHERE is_important=1'),
  countByCat:    db.prepare('SELECT business_category, COUNT(*) as n FROM news WHERE timestamp > ? AND business_category != \'\' GROUP BY business_category ORDER BY n DESC'),
  countBySrc:    db.prepare('SELECT source, COUNT(*) as n FROM news GROUP BY source ORDER BY n DESC LIMIT 30'),
};

// ── saveNews ──────────────────────────────────────────────────────────────────
async function saveNews(items) {
  // 1. SQLite 事务批量写入
  const tx = db.transaction((rows) => {
    for (const item of rows) {
      const nTitle = normalizeKey(item.title, '').split('|')[0];
      const row    = {
        ...item,
        normalized_title:    nTitle,
        detail:              item.detail              || '',
        business_category:   item.business_category   || '',
        competitor_category: item.competitor_category || '',
        sent_to_wecom:       item.sent_to_wecom        || 0,
        content:             (item.content || '').substring(0, 500),
      };
      try {
        STMT.insert.run(row);
      } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: news.url')) {
          // URL 冲突单独处理（更新除时间戳外的字段）
          db.prepare(`
            UPDATE news SET
              title               = @title,
              normalized_title    = @normalized_title,
              is_important        = MAX(is_important, @is_important),
              sent_to_wecom       = MAX(sent_to_wecom, @sent_to_wecom),
              business_category   = CASE WHEN @business_category!='' THEN @business_category ELSE business_category END,
              competitor_category = CASE WHEN @competitor_category!='' THEN @competitor_category ELSE competitor_category END,
              detail              = CASE WHEN @detail!='' THEN @detail ELSE detail END
            WHERE url = @url
          `).run(row);
        } else {
          console.warn('[DB insert]', err.message?.substring(0, 80), '|', item.title?.substring(0, 40));
        }
      }
    }
  });

  try { tx(items); } catch (e) { console.error('[DB saveNews fatal]', e.message); }

  // 2. Supabase 同步（批量 upsert）
  if (USE_SUPABASE && supabase && items.length > 0) {
    const seen      = new Set();
    const cleanRows = items
      .filter(i => i.url && !seen.has(i.url) && seen.add(i.url))
      .map(i => ({
        title:               i.title,
        content:             (i.content || '').substring(0, 500),
        detail:              i.detail              || '',
        source:              i.source,
        url:                 i.url,
        category:            i.category            || 'Signals',
        business_category:   i.business_category   || '',
        competitor_category: i.competitor_category || '',
        timestamp:           Math.round(i.timestamp || 0),
        is_important:        i.is_important         || 0,
        sent_to_wecom:       i.sent_to_wecom        || 0,
      }));

    // 分批 upsert（Supabase 单次上限 ~500 行）
    for (let i = 0; i < cleanRows.length; i += DB.SUPABASE_CHUNK_SIZE) {
      const chunk = cleanRows.slice(i, i + DB.SUPABASE_CHUNK_SIZE);
      const { error } = await supabase.from('news').upsert(chunk, { onConflict: 'title,source' });
      if (error) console.error('[Supabase upsert]', error.message);
    }
  }
}

// ── getNews（增加搜索参数）───────────────────────────────────────────────────
function getNews(limit = 100, source = null, important = 0, search = '') {
  let sql    = 'SELECT * FROM news WHERE 1=1 ';
  const params = [];

  if (important === 1) {
    sql += 'AND is_important=1 ';
  } else if (source && source !== 'All') {
    sql += 'AND source=? ';
    params.push(source);
  }

  if (search) {
    sql += "AND (title LIKE ? OR content LIKE ? OR detail LIKE ?) ";
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  sql += 'ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

// ── getStats（供健康检查 + 前端图表使用）──────────────────────────────────────
function getStats(since = 0) {
  const sinceTs = since || (Date.now() - 7 * 24 * 3600 * 1000);
  return {
    total:      STMT.countAll.get().n,
    important:  STMT.countImportant.get().n,
    categories: STMT.countByCat.all(sinceTs),
    sources:    STMT.countBySrc.all(),
  };
}

// ── getAlreadyProcessed（批量查询，性能优化版）────────────────────────────────
async function getAlreadyProcessed(items) {
  const processed        = new Set();
  const sentToWeCom      = new Set();
  const existingTimestamps = new Map();
  if (!items?.length) return { processed, sentToWeCom, existingTimestamps };

  const urls = items.map(i => i.url).filter(Boolean);

  if (USE_SUPABASE && supabase) {
    // Supabase: 分批批量查询
    for (let i = 0; i < items.length; i += DB.SUPABASE_CHUNK_SIZE) {
      const chunk      = items.slice(i, i + DB.SUPABASE_CHUNK_SIZE);
      const chunkUrls  = chunk.map(c => c.url).filter(Boolean);

      const { data }   = await supabase.from('news')
        .select('url, title, source, business_category, sent_to_wecom, timestamp')
        .in('url', chunkUrls);

      const foundUrls  = new Set();
      (data || []).forEach(r => {
        foundUrls.add(r.url);
        const nKey = normalizeKey(r.title, r.source);
        if (r.business_category)  { processed.add(r.url);   processed.add(nKey); }
        if (r.sent_to_wecom)      { sentToWeCom.add(r.url); sentToWeCom.add(nKey); }
        if (r.timestamp)          { existingTimestamps.set(r.url, r.timestamp); existingTimestamps.set(nKey, r.timestamp); }
      });

      // 二轮：URL未命中的用 title 查
      const notFound = chunk.filter(c => c.url && !foundUrls.has(c.url));
      if (notFound.length > 0) {
        const { data: td } = await supabase.from('news')
          .select('url, title, source, sent_to_wecom, business_category, timestamp')
          .in('title', notFound.map(c => c.title));
        (td || []).forEach(r => {
          const nKey = normalizeKey(r.title, r.source);
          const m    = notFound.find(i => normalizeKey(i.title, i.source) === nKey);
          if (!m) return;
          if (r.business_category)  { processed.add(m.url);   processed.add(nKey); }
          if (r.sent_to_wecom)      { sentToWeCom.add(m.url); sentToWeCom.add(nKey); }
          if (r.timestamp)          { existingTimestamps.set(m.url, r.timestamp); existingTimestamps.set(nKey, r.timestamp); }
        });
      }
    }
  } else {
    // SQLite：批量 IN 查询（避免逐条查询）
    if (urls.length > 0) {
      const ph = urls.map(() => '?').join(',');
      STMT.getByUrls(ph).all(...urls).forEach(r => {
        const nKey   = r.normalized_title + '|' + (r.source || '').toLowerCase();
        const nTitle = r.normalized_title;
        if (r.business_category)  { processed.add(r.url);   processed.add(nKey); processed.add(nTitle); }
        if (r.sent_to_wecom === 1){ sentToWeCom.add(r.url); sentToWeCom.add(nKey); sentToWeCom.add(nTitle); }
        if (r.timestamp)          { existingTimestamps.set(r.url, r.timestamp); existingTimestamps.set(nKey, r.timestamp); }
      });
    }

    // 补充：通过 normalized_title 匹配（URL 可能已变）
    for (const item of items) {
      const nTitle = normalizeKey(item.title, '').split('|')[0];
      const nKey   = `${nTitle}|${(item.source || '').toLowerCase()}`;
      if (processed.has(nTitle) && sentToWeCom.has(nTitle)) continue;

      const row = STMT.getByNorm.get(nTitle);
      if (row) {
        if (row.business_category)  { processed.add(nKey);   processed.add(nTitle); }
        if (row.sent_to_wecom === 1){ sentToWeCom.add(nKey); sentToWeCom.add(nTitle); if (item.url) sentToWeCom.add(item.url); }
        if (row.timestamp)          { existingTimestamps.set(nKey, row.timestamp); if (item.url) existingTimestamps.set(item.url, row.timestamp); }
      }
    }
  }

  return { processed, sentToWeCom, existingTimestamps };
}

// ── updateSentStatus ──────────────────────────────────────────────────────────
async function updateSentStatus(item) {
  const nTitle = normalizeKey(item.title, '').split('|')[0];
  try {
    db.transaction(() => {
      if (item.url) STMT.updateByUrl.run(item.url);
      STMT.updateByTitle.run(item.title, item.source);
      STMT.updateByNorm.run(nTitle);
    })();
  } catch (e) {
    console.warn('[updateSentStatus SQLite]', e.message?.substring(0, 60));
  }

  if (USE_SUPABASE && supabase) {
    try {
      await supabase.from('news').upsert({
        title:               item.title,
        source:              item.source,
        url:                 item.url   || '',
        content:             (item.content || '').substring(0, 500),
        category:            item.category            || '',
        business_category:   item.business_category   || '',
        competitor_category: item.competitor_category || '',
        detail:              item.detail              || '',
        timestamp:           item.timestamp           || Date.now(),
        is_important:        item.is_important         || 1,
        sent_to_wecom:       1,
      }, { onConflict: 'title,source' });
    } catch (e) {
      console.warn('[updateSentStatus Supabase]', e.message?.substring(0, 60));
    }
  }
}

module.exports = { db, saveNews, getNews, getStats, getAlreadyProcessed, updateSentStatus, normalizeKey };
