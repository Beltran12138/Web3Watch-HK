'use strict';

// GET /api/quality —— 数据质量概况，按最近 7 天入库的条目算（最多 5000 条）。
// 替代旧 Express 服务的 /api/monitoring、/api/quality、/api/cache-status（那三个读的是进程内状态，Vercel 上没有）。
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const resp = await fetch(
      `${url}/rest/v1/news?select=source,timestamp,business_category,is_important,created_at&created_at=gte.${since}&limit=5000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await resp.json();
    const rows = Array.isArray(data) ? data : [];
    const day = Date.now() - 86400000;
    const bySource = {};
    for (const r of rows) {
      const s = bySource[r.source] || (bySource[r.source] = { source: r.source, total: 0, classified: 0 });
      s.total++;
      if (r.business_category) s.classified++;
    }
    res.json({
      success: true,
      data: {
        window_days: 7,
        total: rows.length,
        last_24h: rows.filter(r => Date.parse(r.created_at) >= day).length,
        classified: rows.filter(r => r.business_category).length,
        important: rows.filter(r => r.is_important === 1).length,
        missing_timestamp: rows.filter(r => !r.timestamp).length,
        by_source: Object.values(bySource).sort((a, b) => b.total - a.total),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
