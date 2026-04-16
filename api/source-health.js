'use strict';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  try {
    const resp = await fetch(`${url}/rest/v1/news?select=source,timestamp&order=timestamp.desc&limit=2000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const data = await resp.json();

    const srcMap = {};
    (Array.isArray(data) ? data : []).forEach(n => {
      if (!srcMap[n.source]) srcMap[n.source] = { source: n.source, latest_timestamp: 0, total_count: 0 };
      srcMap[n.source].total_count++;
      if (n.timestamp > srcMap[n.source].latest_timestamp) srcMap[n.source].latest_timestamp = n.timestamp;
    });

    const now = Date.now();
    const sourceHealth = Object.values(srcMap)
      .sort((a, b) => b.latest_timestamp - a.latest_timestamp)
      .map(row => ({
        source: row.source,
        latest_timestamp: row.latest_timestamp,
        total_count: row.total_count,
        status: (now - row.latest_timestamp) > 7200000 ? 'stale' : 'healthy',
        hours_since_update: Math.floor((now - row.latest_timestamp) / 3600000),
      }));

    res.json({ success: true, data: sourceHealth });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
