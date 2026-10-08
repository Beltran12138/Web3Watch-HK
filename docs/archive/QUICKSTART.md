# Alpha Radar 快速参考指南

## 🚀 新增功能速览

### 1. 数据源健康监控
```bash
# 查看所有源状态
curl http://localhost:3001/api/health/sources

# 查看单个源详情
curl http://localhost:3001/api/health/sources/Binance
```

### 2. RSS 订阅
```bash
# 获取高价值情报 RSS
curl http://localhost:3001/api/feed.rss?min_score=80&limit=20

# JSON 格式
curl http://localhost:3001/api/feed.json?min_score=85
```

### 3. Notion 集成
```bash
# 同步高价值情报到 Notion
curl -X POST http://localhost:3001/api/integrations/notion/sync \
  -H "Content-Type: application/json" \
  -d '{"minScore":85,"limit":20}'
```

### 4. GitHub 集成
```bash
# 为高价值情报创建 Issues
curl -X POST http://localhost:3001/api/integrations/github/issues \
  -H "Content-Type: application/json" \
  -d '{"minScore":70,"limit":10}'

# 导出昨日情报到 Release
curl -X POST http://localhost:3001/api/integrations/github/export-daily \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-15"}'
```

---

## 📦 依赖安装

```bash
# YAML 配置支持
npm install js-yaml

# Notion 集成（可选）
npm install @notionhq/client

# GitHub 集成（可选）
npm install @octokit/rest

# 或者一次性安装所有
npm install js-yaml @notionhq/client @octokit/rest
```

---

## 🔧 环境变量配置

### 必需（已有）
```env
DEEPSEEK_API_KEY=sk-xxx
WECOM_WEBHOOK_URL=https://...
```

### 推荐（新增）
```env
# Feishu 推送
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
FEISHU_SECRET=xxx

# Telegram 增强
TELEGRAM_CHANNEL_ID=-100xxx  # 频道广播用

# Notion 集成
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=xxx

# GitHub 集成
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=username/repo-name
```

---

## 📁 YAML 配置示例

### sources.yaml
```yaml
high_frequency:
  - name: SFC
    type: rss
    url: https://www.sfc.hk/en/RSS-feed/Regulatory-news
    enabled: true
    
low_frequency:
  - name: Binance
    type: rss
    url: https://www.binance.com/en/feed/news
    enabled: true

settings:
  defaults:
    maxAgeHours: 48
    pushCooldownHours: 24
```

### 使用方式
```javascript
const { loadSourcesConfig } = require('./config-loader');
const config = loadSourcesConfig();
console.log(config.sources); // 自动加载 YAML
```

---

## 🤖 AI 成本优化器

### 使用批量处理
```javascript
const { processBatchSmart } = require('./ai-optimizer');

const results = await processBatchSmart(items, {
  useSemanticDedup: true,  // 语义去重
  respectBudget: true,     // 预算控制
  recentInsights: [],      // 行业记忆
});
```

### 预期效果
- AI 调用次数减少 50-70%
- 日成本从 $10 降至 $4

---

## 📱 推送渠道对比

| 渠道 | 适用场景 | 配置难度 |
|------|---------|----------|
| 企业微信 | 国内团队主力 | ⭐ |
| Telegram | Web3 用户首选 | ⭐⭐ |
| 飞书 | 国内企业 | ⭐⭐ |
| Slack | 国际团队 | ⭐⭐ |
| Email | 正式报告 | ⭐⭐⭐ |
| RSS | 个人阅读器 | ⭐ |

---

## 🔄 定时任务说明

| 时间 | 任务 | 说明 |
|------|------|------|
| 每 5 分钟 | 高频抓取 | T0 数据源 |
| 每 30 分钟 | 低频抓取 | T1 数据源 |
| 每小时 | 健康检查 | 故障告警 |
| 每 6 小时 | Notion 同步 | 高价值情报 |
| 每天 18:00 | 日报 | 企业微信 |
| 每天 00:30 | GitHub 导出 | Releases 归档 |
| 每周五 18:00 | 周报 | 企业微信 |
| 每天 02:00 | 数据清理 | 生命周期管理 |

---

## 🐛 故障排查

### 数据源健康告警
```bash
# 手动触发检查
curl -X POST http://localhost:3001/api/health/check

# 重置某个源状态
curl -X POST http://localhost:3001/api/health/sources/Binance/reset
```

### AI 成本超预算
```javascript
// 查看当前状态
const { aiCostTracker } = require('./ai');
console.log(aiCostTracker.getStatus());
// { dailyCostUSD: '3.5', budgetUsedPercent: '35' }
```

### Notion/GitHub 集成失败
```bash
# 检查配置状态
curl http://localhost:3001/api/integrations/status
```

---

## 📊 前端组件使用

### 在 React 中使用
```jsx
// 数据源健康监控
React.createElement(SourceHealthPanel)

// 趋势洞察
React.createElement(InsightsPanel)
```

### HTML 引入
```html
<script src="/components.js"></script>
<script>
  // 直接使用全局组件
  const panel = React.createElement(SourceHealthPanel);
</script>
```

---

## 🎯 最佳实践

### 1. 添加新数据源
```yaml
# sources.yaml
low_frequency:
  - name: NewSource
    type: rss
    url: https://example.com/rss
    tier: low
    enabled: true
    maxAgeHours: 48
```

### 2. 调整 AI 预算
```env
AI_COST_DAILY_BUDGET_USD=15  # 提高预算
AI_COST_ALERT_THRESHOLD=0.9  # 90% 时告警
```

### 3. 自定义推送频率
```env
# 修改 cron 表达式
SCRAPE_HIGH_CRON=*/3 * * * *   # 3 分钟一次
SCRAPE_LOW_CRON=*/15 * * * *   # 15 分钟一次
```

---

## 📞 支持

- 详细文档：`OPTIMIZATION_FINAL_REPORT.md`
- API 文档：`http://localhost:3001/api-docs` (Swagger)
- 问题反馈：GitHub Issues
