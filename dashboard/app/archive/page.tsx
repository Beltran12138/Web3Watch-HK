import { supabase } from '@/lib/supabase';
import { bjDate, formatDate } from '@/lib/utils';
import Link from 'next/link';

export const revalidate = 3600;

async function getArchive() {
  const since = Date.now() - 30 * 86400000;
  const { data } = await supabase
    .from('news')
    .select('timestamp,alpha_score,is_important,business_category')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false });
  return data || [];
}

export default async function ArchivePage() {
  const items = await getArchive();

  // 按日期聚合
  const byDate: Record<string, { total: number; important: number; cats: Set<string> }> = {};
  for (const item of items) {
    const d = bjDate(item.timestamp);
    if (!byDate[d]) byDate[d] = { total: 0, important: 0, cats: new Set() };
    byDate[d].total++;
    if ((item.alpha_score ?? 0) >= 75 || item.is_important) byDate[d].important++;
    if (item.business_category) byDate[d].cats.add(item.business_category);
  }

  const dates = Object.keys(byDate).sort().reverse();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">📅 历史日报存档</h1>
      <p className="text-sm text-gray-500 mb-6">近 30 天情报记录</p>

      <div className="grid gap-2">
        {dates.map(date => {
          const s = byDate[date];
          return (
            <Link
              key={date}
              href={`/archive/${date}`}
              className="card p-4 flex items-center justify-between hover:border-brand/40 group"
            >
              <div>
                <div className="font-semibold text-gray-900 group-hover:text-brand">
                  {formatDate(date)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {Array.from(s.cats).slice(0, 4).join(' · ')}
                  {s.cats.size > 4 && ` +${s.cats.size - 4}`}
                </div>
              </div>
              <div className="flex items-center gap-4 text-right shrink-0">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-700">{s.total}</div>
                  <div className="text-xs text-gray-400">条情报</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-500">{s.important}</div>
                  <div className="text-xs text-gray-400">重要</div>
                </div>
                <span className="text-brand text-xs hidden sm:block">查看 →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
