const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

let supabase = null;
if (USE_SUPABASE) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
}

const db = new Database(path.join(__dirname, 'alpha_radar.db'));

// SQLite setup (always runs for local caching/fallback)
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    detail TEXT,
    source TEXT NOT NULL,
    url TEXT UNIQUE,
    category TEXT,
    business_category TEXT,
    competitor_category TEXT,
    timestamp INTEGER,
    is_important INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_timestamp ON news(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_source ON news(source);
`);

// Migration: add new columns if they don't exist (safe for existing DBs)
const existingCols = db.prepare('PRAGMA table_info(news)').all().map(c => c.name);
if (!existingCols.includes('detail'))               db.exec("ALTER TABLE news ADD COLUMN detail TEXT DEFAULT ''");
if (!existingCols.includes('business_category'))    db.exec("ALTER TABLE news ADD COLUMN business_category TEXT DEFAULT ''");
if (!existingCols.includes('competitor_category'))  db.exec("ALTER TABLE news ADD COLUMN competitor_category TEXT DEFAULT ''");

async function saveNews(items) {
  // 1. Save to local SQLite
  const insert = db.prepare(`
    INSERT INTO news (title, content, detail, source, url, category, business_category, competitor_category, timestamp, is_important)
    VALUES (@title, @content, @detail, @source, @url, @category, @business_category, @competitor_category, @timestamp, @is_important)
    ON CONFLICT(url) DO UPDATE SET
      is_important = excluded.is_important,
      business_category = COALESCE(excluded.business_category, news.business_category),
      competitor_category = COALESCE(excluded.competitor_category, news.competitor_category),
      detail = COALESCE(excluded.detail, news.detail)
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      insert.run({
        ...item,
        detail: item.detail || '',
        business_category: item.business_category || '',
        competitor_category: item.competitor_category || ''
      });
    }
  });
  transaction(items);

  // 2. Sync to Supabase if enabled
  if (USE_SUPABASE && supabase) {
    console.log(`[Supabase] Syncing ${items.length} items...`);
    const seen = new Set();
    const cleanItems = items
      .filter(item => item.url && !seen.has(item.url) && seen.add(item.url))
      .map(item => ({
        title: item.title,
        content: item.content || '',
        detail: item.detail || '',
        source: item.source,
        url: item.url,
        category: item.category || 'Signals',
        business_category: item.business_category || '',
        competitor_category: item.competitor_category || '',
        timestamp: Math.round(item.timestamp),
        is_important: item.is_important || 0
      }));

    const { error } = await supabase
      .from('news')
      .upsert(cleanItems, { onConflict: 'url' });

    if (error) console.error('[Supabase Error]:', error.message);
    else console.log('[Supabase Success]: Items synced.');
  }
}

function getNews(limit = 100, source = null, important = 0) {
  let query = 'SELECT * FROM news WHERE 1=1 ';
  const params = [];

  if (important == 1) {
    query += 'AND is_important = 1 ';
  } else if (source && source !== 'All') {
    query += 'AND source = ? ';
    params.push(source);
  }

  query += 'ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

module.exports = { db, saveNews, getNews };
