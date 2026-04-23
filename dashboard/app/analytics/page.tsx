import { supabase } from '@/lib/supabase';
import { bjDate } from '@/lib/utils';
import CategoryChart from '@/components/charts/CategoryChart';
import VolumeChart from '@/components/charts/VolumeChart';

export const revalidate = 3600;

async function getAnalyticsData() {
  const since = Date.now() - 30 * 86400000;
  const { data } = await supabase
    .from('news')
    .select('timestamp,business_category,alpha_score,is_important,source')
    .gte('timestamp', since);
  return data || [];
}

export default async function AnalyticsPage() {
  const items = await getAnalyticsData();

  // Category distribution
  const catCount: Record<string, number> = {};
  for (const item of items) {
    const cat = item.business_category || '未分类';
    catCount[cat] = (catCount[cat] || 0) + 1;
  }
  const catData = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  // Daily volume (last 14 days)
  const dayCount: Record<string, { total: number; important: number }> = {};
  for (const item of items) {
    const d = bjDate(item.timestamp);
    if (!dayCount[d]) dayCount[d] = { total: 0, important: 0 };
    dayCount[d].total++;
    if ((item.alpha_score ?? 0) >= 75 || item.is_important) dayCount[d].important++;
  }
  const volumeData = Object.entries(dayCount)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, s]) => ({
      date: date.slice(5), // MM-DD
      total: s.total,
      important: s.important,
    }));

  // Top sources
  const srcCount: Record<string, number> = {};
  for (const item of items) srcCount[item.source] = (srcCount[item.source] || 0) + 1;
  const topSources = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Score distribution
  const scored = items.filter(i => i.alpha_score != null);
  const dist = { high: 0, mid: 0, low: 0, veryHigh: 0 };
  for (const i of scored) {
    const s = i.alpha_score!;
    if (s >= 90) dist.veryHigh++;
    else if (s >= 75) dist.high++;
    else if (s >= 50) dist.mid++;
    else dist.low++;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">📊 数据统计</h1>
      <p className="text-sm text-gray-500 mb-6">近 30 天情报分析 · 共 {items.length} 条</p>

      {/* Score Distribution */}
      <section className="mb-8">
        <p className="section-title">Alpha Score 分布</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '极高 ≥90', val: dist.veryHigh, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            { label: '高 75-89',  val: dist.high,     color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
            { label: '中 50-74',  val: dist.mid,      color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
            { label: '低 <50',    val: dist.low,      color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`card p-4 text-center border ${s.bg}`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Volume Chart */}
      <section className="mb-8">
        <p className="section-title">近 14 天每日情报量</p>
        <div className="card p-4">
          <VolumeChart data={volumeData} />
        </div>
      </section>

      {/* Two-column: Category + Top Sources */}
      <div className="grid sm:grid-cols-2 gap-6">
        <section>
          <p className="section-title">业务分类分布（近30天）</p>
          <div className="card p-4">
            <CategoryChart data={catData.slice(0, 10)} />
          </div>
        </section>

        <section>
          <p className="section-title">最活跃数据源</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">来源</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">条数</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">占比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topSources.map(([src, cnt]) => (
                  <tr key={src} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{src}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-brand">{cnt}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                      {((cnt / items.length) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
