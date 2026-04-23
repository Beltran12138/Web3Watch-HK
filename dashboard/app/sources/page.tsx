import { supabase } from '@/lib/supabase';
import { bjDate } from '@/lib/utils';

export const revalidate = 1800;

const HK_SOURCES = new Set(['SFC', 'OSL', 'Exio', 'TechubNews', 'HashKeyGroup', 'HashKeyExchange', 'WuBlock']);

async function getSourceStats() {
  const since = Date.now() - 7 * 86400000;
  const { data } = await supabase
    .from('news')
    .select('source,timestamp,alpha_score')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false });
  return data || [];
}

export default async function SourcesPage() {
  const items = await getSourceStats();

  const bySource: Record<string, { count: number; highScore: number; lastSeen: number; scores: number[] }> = {};
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = { count: 0, highScore: 0, lastSeen: 0, scores: [] };
    bySource[item.source].count++;
    bySource[item.source].lastSeen = Math.max(bySource[item.source].lastSeen, item.timestamp);
    if (item.alpha_score) {
      bySource[item.source].highScore = Math.max(bySource[item.source].highScore, item.alpha_score);
      bySource[item.source].scores.push(item.alpha_score);
    }
  }

  const sources = Object.entries(bySource)
    .map(([name, s]) => ({
      name,
      count: s.count,
      highScore: s.highScore,
      lastSeen: s.lastSeen,
      avgScore: s.scores.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : null,
      isHK: HK_SOURCES.has(name),
    }))
    .sort((a, b) => b.count - a.count);

  const now = Date.now();
  function freshLabel(ts: number) {
    const h = (now - ts) / 3600000;
    if (h < 1) return { label: '< 1小时', color: 'text-green-600' };
    if (h < 6) return { label: `${Math.round(h)}小时前`, color: 'text-green-500' };
    if (h < 24) return { label: `${Math.round(h)}小时前`, color: 'text-yellow-600' };
    return { label: `${bjDate(ts)}`, color: 'text-gray-400' };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">📡 数据源状态</h1>
      <p className="text-sm text-gray-500 mb-6">近 7 天活跃数据源 · 共 {sources.length} 个</p>

      {/* HK Sources */}
      <section className="mb-8">
        <p className="section-title">🏛️ 香港合规板块</p>
        <SourceTable sources={sources.filter(s => s.isHK)} freshLabel={freshLabel} />
      </section>

      {/* Other Sources */}
      <section>
        <p className="section-title">🌐 其他来源</p>
        <SourceTable sources={sources.filter(s => !s.isHK)} freshLabel={freshLabel} />
      </section>
    </div>
  );
}

function SourceTable({
  sources,
  freshLabel,
}: {
  sources: ReturnType<typeof Array.prototype.map> extends (infer T)[] ? T[] : never[];
  freshLabel: (ts: number) => { label: string; color: string };
}) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold text-gray-600">数据源</th>
            <th className="text-center px-4 py-2.5 font-semibold text-gray-600">7天条数</th>
            <th className="text-center px-4 py-2.5 font-semibold text-gray-600 hidden sm:table-cell">均分</th>
            <th className="text-center px-4 py-2.5 font-semibold text-gray-600 hidden sm:table-cell">最高分</th>
            <th className="text-right px-4 py-2.5 font-semibold text-gray-600">最近更新</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {(sources as any[]).map((s: any) => {
            const { label, color } = freshLabel(s.lastSeen);
            return (
              <tr key={s.name} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-2.5 text-center font-bold text-brand">{s.count}</td>
                <td className="px-4 py-2.5 text-center text-gray-600 hidden sm:table-cell">
                  {s.avgScore ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                  {s.highScore > 0 ? (
                    <span className={`score-badge ${s.highScore >= 90 ? 'text-red-700 bg-red-50 border-red-200' : s.highScore >= 75 ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                      {s.highScore}
                    </span>
                  ) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right text-xs ${color}`}>{label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
