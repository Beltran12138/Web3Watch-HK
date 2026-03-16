/**
 * Alpha Radar TypeScript 类型定义
 * 为现有 JavaScript 代码提供类型支持
 */

// 新闻条目
export interface NewsItem {
  id?: number;
  title: string;
  normalized_title?: string;
  content?: string;
  detail?: string;
  impact?: '利好' | '利空' | '中性';
  bitv_action?: string;
  source: string;
  url?: string;
  category?: string;
  business_category?: string;
  competitor_category?: string;
  timestamp?: number;
  is_important?: number;
  alpha_score?: number;
  sent_to_wecom?: number;
  created_at?: string;
}

// 数据源配置
export interface SourceConfig {
  maxAgeHours: number;
  enableStrictTimestamp: boolean;
  dedupMode: 'strict' | 'normal' | 'loose';
  pushCooldownHours: number;
  disabled?: boolean;
}

// AI 分类结果
export interface AIClassificationResult {
  business_category: string;
  competitor_category: string;
  detail: string;
  alpha_score: number;
  is_important: number;
  impact?: '利好' | '利空' | '中性';
  bitv_action?: string;
  _ai_source?: string;
  _prompt_version?: string;
}

// 爬虫结果
export interface ScraperResult {
  title: string;
  content?: string;
  source: string;
  url?: string;
  category?: string;
  timestamp?: number;
  is_important?: number;
}

// 质量报告
export interface QualityIssue {
  field: string;
  issue: string;
  severity: 'pass' | 'warn' | 'fail';
}

export interface QualityReport {
  level: 'pass' | 'warn' | 'fail';
  score: number;
  issues: QualityIssue[];
}

// 告警条目
export interface AlertEntry {
  level: 'info' | 'warn' | 'error' | 'critical';
  category: string;
  message: string;
  ts: number;
  context?: Record<string, unknown>;
}

// 推送消息
export interface PushMessage {
  title?: string;
  content: string;
  type?: 'text' | 'markdown';
  html?: string;
}

// 统计响应
export interface StatsResponse {
  total: number;
  important: number;
  categories: Array<{ business_category: string; n: number }>;
  sources: Array<{ source: string; n: number }>;
}

// 健康检查响应
export interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  startedAt: string;
  db: {
    total: number;
    important: number;
    sources: StatsResponse['sources'];
  };
  ai?: Record<string, unknown>;
  push?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  version: string;
}

// 数据源健康状态
export interface SourceHealthEntry {
  source: string;
  latest_timestamp: number;
  total_count: number;
  last_pushed_timestamp?: number;
  last_pushed_title?: string;
  status: 'healthy' | 'stale';
  hours_since_update: number;
}

// 熔断器状态
export interface CircuitBreakerState {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  stats: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    rejectedCalls: number;
    lastError: string | null;
  };
  lastFailureTime: number | null;
}

// Scraper 注册表项
export interface ScraperRegistryEntry {
  name: string;
  fn: (...args: unknown[]) => Promise<unknown>;
  config: SourceConfig & {
    tier: 'high' | 'low';
    circuitBreaker: {
      failureThreshold: number;
      resetTimeout: number;
    };
  };
  stats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastRun: string | null;
    lastError: string | null;
    avgDuration: number;
  };
}

// Express 请求/响应扩展
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志记录器接口
export interface Logger {
  debug(obj: Record<string, unknown> | Error, msg?: string): void;
  info(obj: Record<string, unknown> | Error, msg?: string): void;
  warn(obj: Record<string, unknown> | Error, msg?: string): void;
  error(obj: Record<string, unknown> | Error, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}
