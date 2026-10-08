'use strict';

// GET /api/export?format=csv|json&days=7 —— 导出最近 N 天的条目（只读，最多 5000 条）
const FIELDS = ['timestamp', 'source', 'title', 'url', 'business_category', 'competitor_category', 'alpha_score', 'is_important', 'detail'];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return res.status(500).json({ success: false, error: 'Missing Supabase credentials' });

  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const since = Date.now() - days * 86400000;

  try {
    const resp = await fetch(
      `${url}/rest/v1/news?select=${FIELDS.join(',')}&timestamp=gte.${since}&order=timestamp.desc&limit=5000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await resp.json();
    const rows = (Array.isArray(data) ? data : []).map(r => ({ ...r, title: (r.title || '').replace(/\s+/g, ' ').trim() }));

    if (format === 'csv') {
      const lines = [FIELDS.join(',')].concat(rows.map(r => FIELDS.map(f =>
        csvCell(f === 'timestamp' && r.timestamp ? new Date(r.timestamp).toISOString() : r[f])).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="web3watch-${days}d.csv"`);
      return res.send('\uFEFF' + lines.join('\n'));
    }
    res.json({ success: true, days, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
