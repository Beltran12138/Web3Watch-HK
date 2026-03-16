/**
 * public/components.js — Alpha Radar 前端组件库
 *
 * 将巨型单文件中的关键组件抽离，便于维护和扩展
 * 使用方法：在 index.html 中引入此文件（在 app.js 之前）
 */

// ── 数据源健康监控面板 ───────────────────────────────────────────────────────
function SourceHealthPanel() {
  const [healthData, setHealthData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health/sources');
      if (!res.ok) throw new Error('Failed to fetch health data');
      const data = await res.json();
      setHealthData(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    const colors = {
      healthy: 'bg-emerald-500',
      warning: 'bg-amber-500',
      critical: 'bg-red-500',
      error: 'bg-red-600',
      empty: 'bg-yellow-400',
      unknown: 'bg-gray-400',
      never: 'bg-gray-300',
    };
    return colors[status] || 'bg-gray-400';
  };

  const getStatusIcon = (status) => {
    const icons = {
      healthy: 'fa-check-circle',
      warning: 'fa-exclamation-triangle',
      critical: 'fa-times-circle',
      error: 'fa-bug',
      empty: 'fa-inbox',
      unknown: 'fa-question-circle',
      never: 'fa-clock',
    };
    return icons[status] || 'fa-question-circle';
  };

  if (loading && !healthData) {
    return React.createElement('div', { className: 'p-4 text-center text-slate-500' }, '加载中...');
  }

  if (error) {
    return React.createElement('div', { className: 'p-4 text-red-500 text-sm' }, `错误：${error}`);
  }

  return React.createElement(
    'div',
    { className: 'space-y-3' },
    React.createElement('div', { className: 'flex justify-between items-center mb-4' },
      React.createElement('h3', { className: 'text-sm font-bold text-slate-700 dark:text-slate-300' }, '数据源健康状态'),
      React.createElement('button', {
        onClick: fetchHealth,
        className: 'text-xs text-blue-500 hover:text-blue-600',
      }, '刷新')
    ),

    React.createElement('div', { className: 'space-y-2 max-h-96 overflow-y-auto' },
      healthData?.map((source) =>
        React.createElement('div', {
          key: source.source,
          className: 'flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700',
        },
          React.createElement('i', {
            className: `fa-solid ${getStatusIcon(source.status)} ${getStatusColor(source.status).replace('bg-', 'text-')} text-lg`,
          }),
          React.createElement('div', { className: 'flex-1 min-w-0' },
            React.createElement('div', { className: 'flex justify-between items-center' },
              React.createElement('span', { className: 'font-medium text-sm truncate' }, source.source),
              React.createElement('span', { className: 'text-xs text-slate-500' }, source.statusText)
            ),
            React.createElement('div', { className: 'flex justify-between items-center text-xs text-slate-500 mt-1' },
              React.createElement('span', null, `最后抓取：${source.lastFetchTime}`),
              source.todayCount !== undefined && React.createElement('span', null, `今日：${source.todayCount}条`)
            )
          )
        )
      )
    ),

    healthData?.length === 0 && React.createElement('div', { className: 'text-center text-slate-400 text-sm py-8' }, '暂无数据源信息')
  );
}

// ── 趋势洞察专栏 ─────────────────────────────────────────────────────────────
function InsightsPanel() {
  const [insights, setInsights] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/insights?limit=10');
      const data = await res.json();
      setInsights(data.data || []);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 300000); // 5 分钟刷新
    return () => clearInterval(interval);
  }, []);

  const getTrendIcon = (trendKey) => {
    if (trendKey.includes('density')) return 'fa-fire text-red-500';
    if (trendKey.includes('policy')) return 'fa-file-contract text-blue-500';
    if (trendKey.includes('exchange')) return 'fa-building text-purple-500';
    return 'fa-chart-line text-green-500';
  };

  return React.createElement(
    'div',
    { className: 'space-y-4' },
    React.createElement('div', { className: 'flex justify-between items-center' },
      React.createElement('h3', { className: 'text-sm font-bold text-slate-700 dark:text-slate-300' }, '趋势洞察'),
      React.createElement('span', { className: 'text-xs text-slate-500' }, `${insights.length} 个趋势`)
    ),

    React.createElement('div', { className: 'space-y-3 max-h-96 overflow-y-auto' },
      loading && insights.length === 0
        ? React.createElement('div', { className: 'text-center text-slate-500 text-sm py-8' }, '加载中...')
        : insights.map((insight, idx) =>
            React.createElement('div', {
              key: insight.id || idx,
              className: 'p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700',
            },
              React.createElement('div', { className: 'flex items-start gap-2' },
                React.createElement('i', {
                  className: `fa-solid ${getTrendIcon(insight.trend_key)} mt-0.5`,
                }),
                React.createElement('div', { className: 'flex-1 min-w-0' },
                  React.createElement('div', { className: 'flex justify-between items-center mb-1' },
                    React.createElement('span', {
                      className: 'font-medium text-sm truncate',
                      title: insight.trend_key,
                    }, insight.trend_key?.replace('density:', '').replace('trend:', '')),
                    React.createElement('span', {
                      className: 'text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full',
                    }, `${insight.evidence_count || 0} 证据`)
                  ),
                  insight.summary && React.createElement('p', {
                    className: 'text-xs text-slate-600 dark:text-slate-400 line-clamp-2',
                  }, insight.summary)
                )
              )
            )
          )
    ),

    !loading && insights.length === 0 && React.createElement('div', {
      className: 'text-center text-slate-400 text-sm py-8',
    }, '暂无趋势洞察')
  );
}

// ── 导出为全局可用组件 ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.SourceHealthPanel = SourceHealthPanel;
  window.InsightsPanel = InsightsPanel;
}
