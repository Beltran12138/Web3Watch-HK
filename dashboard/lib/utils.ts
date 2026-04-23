export function bjDate(ts: number): string {
  return new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00+08:00').toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

export function scoreColor(score: number | null): string {
  if (!score) return 'text-gray-400 bg-gray-50 border-gray-200';
  if (score >= 90) return 'text-red-700 bg-red-50 border-red-200';
  if (score >= 75) return 'text-orange-700 bg-orange-50 border-orange-200';
  if (score >= 60) return 'text-green-700 bg-green-50 border-green-200';
  return 'text-gray-500 bg-gray-50 border-gray-200';
}

export function impactColor(impact: string | null): string {
  if (impact === '利好') return 'text-green-600';
  if (impact === '利空') return 'text-red-600';
  return 'text-gray-400';
}

export function impactIcon(impact: string | null): string {
  if (impact === '利好') return '📈';
  if (impact === '利空') return '📉';
  return '➡️';
}

export const CAT_ICONS: Record<string, string> = {
  '合规': '⚖️', 'RWA': '🏢', '稳定币/平台币': '💵',
  '投融资': '💰', '交易/量化/AI': '🤖', '钱包/支付': '💳',
  'toB/机构': '🏦', '合约': '📊', '公链': '🔗',
  '法币兑换': '🔄', '理财': '📈', '拉新/社媒/社群/pr': '📣',
  '经纪/OTC/托管': '🤝', '大零户/VIP': '👑', '学院/社交/内容/活动': '🎓',
};
