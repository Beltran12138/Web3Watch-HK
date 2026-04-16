'use strict';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'count=exact' };

  try {
    const [totalResp, importantResp, srcResp] = await Promise.all([
      fetch(`${url}/rest/v1/news?select=id`, { headers }),
      fetch(`${url}/rest/v1/news?select=id&is_important=eq.1`, { headers }),
      fetch(`${url}/rest/v1/news?select=source`, { headers: { ...headers, Prefer: '' } }),
    ]);

    const total = parseInt(totalResp.headers.get('content-range')?.split('/')[1] || '0', 10);
    const important = parseInt(importantResp.headers.get('content-range')?.split('/')[1] || '0', 10);
    const srcRows = await srcResp.json();

    const srcMap = {};
    (Array.isArray(srcRows) ? srcRows : []).forEach(r => {
      if (r.source) srcMap[r.source] = (srcMap[r.source] || 0) + 1;
    });
    const sources = Object.entries(srcMap).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n);

    res.json({ success: true, data: { total, important, sources, categories: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
