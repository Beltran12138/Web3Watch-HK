'use strict';

const START = Date.now();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  try {
    let total = 0;
    if (url && key) {
      const resp = await fetch(`${url}/rest/v1/news?select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
      });
      total = parseInt(resp.headers.get('content-range')?.split('/')[1] || '0', 10);
    }
    res.json({ status: 'ok', uptime: Math.floor((Date.now() - START) / 1000), db: { total }, version: '2.1.0', env: 'vercel' });
  } catch (err) {
    res.json({ status: 'ok', uptime: 0, db: { total: 0 }, error: err.message });
  }
};
