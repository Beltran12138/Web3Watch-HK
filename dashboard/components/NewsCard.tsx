import { NewsItem } from '@/lib/supabase';
import { scoreColor, impactIcon, impactColor, CAT_ICONS, formatTime } from '@/lib/utils';

export default function NewsCard({ item }: { item: NewsItem }) {
  const cat  = item.business_category || '未分类';
  const icon = CAT_ICONS[cat] || '📰';

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="cat-badge">{icon} {cat}</span>
        {item.alpha_score != null && (
          <span className={`score-badge ${scoreColor(item.alpha_score)}`}>
            {item.alpha_score}
          </span>
        )}
        {item.impact && (
          <span className={`text-xs font-medium ${impactColor(item.impact)}`}>
            {impactIcon(item.impact)} {item.impact}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {item.source} · {formatTime(item.timestamp)}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener" className="hover:text-brand">
            {item.title}
          </a>
        ) : item.title}
      </h3>

      {item.detail && (
        <p className="text-xs text-gray-600 leading-relaxed mb-1.5">{item.detail}</p>
      )}

      {item.bitv_action && (
        <div className="text-xs text-gray-600 bg-amber-50 border-l-2 border-amber-400 pl-2.5 py-1.5 rounded-r">
          💡 {item.bitv_action}
        </div>
      )}
    </div>
  );
}
