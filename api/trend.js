'use strict';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
    const category = (req.query.category || '').trim();
    const since = Date.now() - days * 24 * 3600 * 1000;

    let apiUrl = `${url}/rest/v1/news?select=timestamp,business_category&timestamp=gte.${since}&business_category=neq.`;
    if (category) apiUrl += `&business_category=eq.${encodeURIComponent(category)}`;

    const resp = await fetch(apiUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const data = await resp.json();

    const trendMap = {};
    (Array.isArray(data) ? data : []).forEach(n => {
      const d = new Date(n.timestamp).toISOString().split('T')[0];
      const cat = category || n.business_category;
      if (!cat) return;
      const k = `${d}|${cat}`;
      if (!trendMap[k]) trendMap[k] = { date: d, category: cat, count: 0 };
      trendMap[k].count++;
    });

    const rows = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ success: true, days, category: category || 'all', data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
