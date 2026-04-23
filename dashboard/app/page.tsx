import { supabase, NewsItem } from '@/lib/supabase';
import { bjDate, formatDate } from '@/lib/utils';
import NewsCard from '@/components/NewsCard';
import StatCard from '@/components/StatCard';
import Link from 'next/link';

export const revalidate = 1800; // 30 min cache

async function getTodayNews(): Promise<NewsItem[]> {
  const since = Date.now() - 24 * 3600000;
  const { data } = await supabase
    .from('news')
    .select('*')
    .gte('timestamp', since)
    .order('alpha_score', { ascending: false, nullsFirst: false })
    .limit(100);
  return (data || []) as NewsItem[];
}

async function getWeekStats() {
  const since = Date.now() - 7 * 86400000;
  const { data } = await supabase
    .from('news')
    .select('source,alpha_score,is_important,business_category')
    .gte('timestamp', since);
  return data || [];
}

export default async function HomePage() {
  const [todayNews, weekData] = await Promise.all([getTodayNews(), getWeekStats()]);

  const today       = bjDate(Date.now());
  const important   = todayNews.filter(n => (n.alpha_score ?? 0) >= 75 || n.is_important);
  const others      = todayNews.filter(n => (n.alpha_score ?? 0) < 75 && !n.is_important);
  const sources7d   = new Set(weekData.map(n => n.source)).size;
  const important7d = weekData.filter(n => (n.alpha_score ?? 0) >= 75).length;

  return (
    <div>
      {/* Hero */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔭 Web3Watch HK 情报看板</h1>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(today)} · 每 15 分钟更新 · DeepSeek AI 分析
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard value={todayNews.length} label="今日情报" sub="条" />
        <StatCard value={important.length} label="重要动态" sub="Alpha≥75" color="text-orange-500" />
        <StatCard value={sources7d} label="活跃数据源" sub="近7天" color="text-green-600" />
        <StatCard value={important7d} label="本周重要事件" sub="近7天" color="text-red-500" />
      </div>

      {/* Today's news */}
      {todayNews.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>今日暂无情报，日报将于 18:00 BJ 生成</p>
        </div>
      ) : (
        <>
          {important.length > 0 && (
            <section className="mb-8">
              <p className="section-title">🔥 重要动态 · Alpha ≥ 75</p>
              <div className="grid gap-3">
                {important.slice(0, 10).map(item => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section className="mb-8">
              <p className="section-title">📡 其他动态</p>
              <div className="grid gap-3">
                {others.slice(0, 20).map(item => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
              {others.length > 20 && (
                <p className="text-center text-xs text-gray-400 mt-3">
                  还有 {others.length - 20} 条 ·{' '}
                  <Link href={`/archive/${today}`} className="text-brand hover:underline">
                    查看全部
                  </Link>
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
