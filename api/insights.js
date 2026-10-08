'use strict';

// GET /api/insights —— 行业记忆（AI 归纳的跨条目趋势），按最近更新取 9 条
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  try {
    const resp = await fetch(`${url}/rest/v1/insights?select=*&order=last_updated.desc.nullslast&limit=9`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const data = await resp.json();
    if (!Array.isArray(data)) return res.status(502).json({ success: false, error: data.message || 'Bad response' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
