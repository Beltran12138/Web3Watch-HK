'use strict';

// 直接用 Node 18 内置 fetch 调 Supabase REST API，不依赖任何 npm 包
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  try {
    const source = req.query.source || 'All';
    const important = req.query.important === '1';
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const search = (req.query.q || '').trim().slice(0, 100);

    let apiUrl = `${url}/rest/v1/news?select=*&order=timestamp.desc&limit=${limit}`;

    if (important) {
      apiUrl += '&is_important=eq.1';
    } else if (source && source !== 'All' && source !== 'Important') {
      apiUrl += `&source=eq.${encodeURIComponent(source)}`;
    }

    if (search) {
      apiUrl += `&or=(title.ilike.*${encodeURIComponent(search)}*,detail.ilike.*${encodeURIComponent(search)}*)`;
    }

    const resp = await fetch(apiUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const data = await resp.json();

    res.json({ success: true, count: data.length, lastUpdate: new Date().toISOString(), data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
