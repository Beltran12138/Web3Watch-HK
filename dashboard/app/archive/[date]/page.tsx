import { supabase, NewsItem } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import NewsCard from '@/components/NewsCard';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

async function getDayNews(date: string): Promise<NewsItem[]> {
  const start = new Date(date + 'T00:00:00+08:00').getTime();
  const end   = start + 86400000;
  const { data } = await supabase
    .from('news')
    .select('*')
    .gte('timestamp', start)
    .lt('timestamp', end)
    .order('alpha_score', { ascending: false, nullsFirst: false });
  return (data || []) as NewsItem[];
}

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const news      = await getDayNews(date);
  const important = news.filter(n => (n.alpha_score ?? 0) >= 75 || n.is_important);
  const others    = news.filter(n => (n.alpha_score ?? 0) < 75 && !n.is_important);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link href="/archive" className="text-sm text-gray-400 hover:text-brand">← 返回存档</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">{formatDate(date)}</h1>
      <p className="text-sm text-gray-500 mb-6">
        共 <strong>{news.length}</strong> 条情报 · 重要 <strong>{important.length}</strong> 条
      </p>

      {news.length === 0 && (
        <div className="text-center py-16 text-gray-400">当日暂无数据</div>
      )}

      {important.length > 0 && (
        <section className="mb-8">
          <p className="section-title">🔥 重要动态 · Alpha ≥ 75</p>
          <div className="grid gap-3">
            {important.map(item => <NewsCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <p className="section-title">📡 其他动态</p>
          <div className="grid gap-3">
            {others.map(item => <NewsCard key={item.id} item={item} />)}
          </div>
        </section>
      )}
    </div>
  );
}
