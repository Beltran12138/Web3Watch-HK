'use strict';

/**
 * i18n.js — 国际化模块
 * 
 * 支持中文/英文双语切换
 */

const translations = {
  zh: {
    app: {
      title: 'Alpha-Radar 行业情报引擎',
      subtitle: 'Web3/Crypto 行业聚合 + AI 分类摘要 + 多渠道推送',
    },
    nav: {
      home: '首页',
      news: '情报',
      stats: '统计',
      settings: '设置',
    },
    news: {
      title: '情报列表',
      source: '来源',
      category: '分类',
      importance: '重要性',
      publishedAt: '发布时间',
      search: '搜索情报...',
      noData: '暂无数据',
      loadMore: '加载更多',
    },
    stats: {
      title: '数据统计',
      total: '总数',
      important: '重要',
      sources: '来源分布',
      categories: '分类分布',
      trend: '趋势分析',
    },
    report: {
      daily: '每日简报',
      weekly: '每周简报',
      generate: '生成报告',
      download: '下载报告',
    },
    status: {
      online: '在线',
      offline: '离线',
      scraping: '抓取中',
      idle: '空闲',
    },
    actions: {
      refresh: '刷新',
      export: '导出',
      subscribe: '订阅',
      share: '分享',
    },
    time: {
      justNow: '刚刚',
      minutesAgo: '{n}分钟前',
      hoursAgo: '{n}小时前',
      daysAgo: '{n}天前',
    },
  },
  en: {
    app: {
      title: 'Alpha-Radar Intelligence Engine',
      subtitle: 'Web3/Crypto News Aggregation + AI Classification + Multi-channel Push',
    },
    nav: {
      home: 'Home',
      news: 'News',
      stats: 'Stats',
      settings: 'Settings',
    },
    news: {
      title: 'Intelligence List',
      source: 'Source',
      category: 'Category',
      importance: 'Importance',
      publishedAt: 'Published',
      search: 'Search intelligence...',
      noData: 'No data available',
      loadMore: 'Load more',
    },
    stats: {
      title: 'Statistics',
      total: 'Total',
      important: 'Important',
      sources: 'Source Distribution',
      categories: 'Category Distribution',
      trend: 'Trend Analysis',
    },
    report: {
      daily: 'Daily Report',
      weekly: 'Weekly Report',
      generate: 'Generate Report',
      download: 'Download Report',
    },
    status: {
      online: 'Online',
      offline: 'Offline',
      scraping: 'Scraping',
      idle: 'Idle',
    },
    actions: {
      refresh: 'Refresh',
      export: 'Export',
      subscribe: 'Subscribe',
      share: 'Share',
    },
    time: {
      justNow: 'Just now',
      minutesAgo: '{n} minutes ago',
      hoursAgo: '{n} hours ago',
      daysAgo: '{n} days ago',
    },
  },
};

let currentLocale = 'zh';

function setLocale(locale) {
  if (translations[locale]) {
    currentLocale = locale;
    return true;
  }
  return false;
}

function getLocale() {
  return currentLocale;
}

function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations[currentLocale];
  
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return key;
    }
  }

  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }
  
  return key;
}

function getTranslations(locale = null) {
  return translations[locale || currentLocale] || translations.zh;
}

function getSupportedLocales() {
  return Object.keys(translations);
}

module.exports = {
  setLocale,
  getLocale,
  t,
  getTranslations,
  getSupportedLocales,
  translations,
};
