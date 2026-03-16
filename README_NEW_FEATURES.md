# Alpha Radar - 📡 Web3/Crypto 行业情报聚合系统

> 多源抓取 + AI 分类 + 多渠道推送 + 第三方集成

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ 核心特性

### 🔄 多源数据抓取
- **25+ 数据源** - RSS、Puppeteer、Twitter API
- **分级处理** - 高频（5 分钟）/低频（30 分钟）
- **健康监控** - 自动故障检测与告警

### 🤖 AI 智能分类
- **多提供商降级** - DeepSeek → OpenRouter → Anthropic → 规则引擎
- **成本优化** - 规则预筛 + 批量处理 + 语义去重
- **预算控制** - 软/硬限制双重保护

### 📢 多渠道推送
- **企业微信** - 国内团队主力
- **Telegram** - Web3 用户首选（支持 inline buttons）
- **飞书** - 国内企业集成
- **Slack** - 国际团队
- **Email** - 正式报告
- **RSS** - 个人阅读器订阅

### 🔗 第三方集成
- **Notion** - 高价值情报自动同步
- **GitHub** - Issues 讨论区 + Releases 归档

---

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境
```bash
cp .env.example .env
# 编辑 .env 填入 API 密钥
```

### 3. 启动服务
```bash
npm start
```

### 4. 访问 Dashboard
```
http://localhost:3001
```

---

## 📦 可选依赖（推荐安装）

```bash
# YAML 配置 + Notion + GitHub 集成
npm install js-yaml @notionhq/client @octokit/rest
```

---

## 🔧 环境变量

### 必需
```env
DEEPSEEK_API_KEY=sk-xxx
WECOM_WEBHOOK_URL=https://...
```

### 推荐
```env
# Feishu
FEISHU_WEBHOOK_URL=https://...
FEISHU_SECRET=xxx

# Telegram
TELEGRAM_BOT_TOKEN=xxx:xxx
TELEGRAM_CHAT_ID=-100xxx
TELEGRAM_CHANNEL_ID=-100xxx  # 可选：频道广播

# Notion
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=xxx

# GitHub
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=username/repo-name
```

完整配置参考：`.env.example`

---

## 📁 YAML 配置（可选）

创建 `sources.yaml` 实现动态配置：

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
```

示例配置：`sources.yaml`

---

## 🎯 主要功能

### 数据源健康监控
```bash
# 查看所有源状态
curl http://localhost:3001/api/health/sources

# 手动触发检查
curl -X POST http://localhost:3001/api/health/check
```

### RSS 订阅
```bash
# 高价值情报 RSS
curl http://localhost:3001/api/feed.rss?min_score=80

# JSON 格式
curl http://localhost:3001/api/feed.json?limit=20
```

### Notion 集成
```bash
# 同步高价值情报
curl -X POST http://localhost:3001/api/integrations/notion/sync \
  -H "Content-Type: application/json" \
  -d '{"minScore":85}'
```

### GitHub 集成
```bash
# 创建 Issues
curl -X POST http://localhost:3001/api/integrations/github/issues \
  -H "Content-Type: application/json" \
  -d '{"minScore":70}'

# 导出到 Release
curl -X POST http://localhost:3001/api/integrations/github/export-daily \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-15"}'
```

---

## 📊 定时任务

| 频率 | 任务 | 说明 |
|------|------|------|
| 每 5 分钟 | 高频抓取 | T0 数据源 |
| 每 30 分钟 | 低频抓取 | T1 数据源 |
| 每小时 | 健康检查 | 故障告警 |
| 每 6 小时 | Notion 同步 | 高价值情报 |
| 每天 18:00 | 日报 | 企业微信 |
| 每天 00:30 | GitHub 导出 | Releases 归档 |
| 每周五 18:00 | 周报 | 企业微信 |

---

## 🧪 测试命令

```bash
# 测试推送
npm run test-push

# 测试健康监控
npm run test:health

# 测试 Notion
npm run test:notion

# 测试 GitHub
npm run test:github
```

---

## 📖 文档

- **完整优化报告**: `OPTIMIZATION_FINAL_REPORT.md`
- **快速参考指南**: `QUICKSTART.md`
- **实施摘要**: `IMPLEMENTATION_SUMMARY.md`
- **API 文档**: `http://localhost:3001/api-docs` (Swagger)

---

## 🏗️ 架构特点

### 技术栈
- **后端**: Node.js + Express
- **数据库**: SQLite (本地) + Supabase (云端)
- **AI**: DeepSeek (主) + 多提供商降级
- **爬虫**: Cheerio + Puppeteer

### 设计哲学
1. **降级策略** - AI 不可用时自动降级到规则引擎
2. **配置驱动** - YAML 配置化，添加数据源无需改代码
3. **可观测性** - 健康监控 + 实时告警
4. **灵活集成** - Notion/GitHub/RSS 多平台支持

---

## 📈 性能指标

| 指标 | 数值 |
|------|------|
| AI 调用减少 | **-58%** |
| 日成本降低 | **-60%** |
| 故障发现时间 | **<1 小时** |
| 推送渠道数 | **6 个** |
| 数据源数量 | **25+** |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- 灵感来自 OpenClaw 多渠道架构
- 感谢所有数据源提供方
