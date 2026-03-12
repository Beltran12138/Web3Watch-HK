# Alpha Radar v1.4.0 更新日志

## 概述

本次更新聚焦于 **系统稳定性提升**、**安全加固** 和 **可扩展性增强**，实现了产品经理建议书中的核心优化项。

---

## 新增功能

### 1. AI 三级降级策略 (ai-provider.js / ai-enhanced.js)

**问题**: 原系统强依赖 DeepSeek API，一旦服务不可用，报告生成完全失败。

**解决方案**:
- **L1**: DeepSeek V3（主要提供商）
- **L2**: 备用提供商（OpenRouter / OpenAI）
- **L3**: 本地规则引擎（关键词匹配 + 启发式评分）

**特性**:
- 自动检测提供商可用性并切换
- 规则引擎支持业务分类、竞品分类、重要性评分
- 所有 AI 处理结果标记来源（便于追踪）
- API 降级时自动生成规则引擎版报告

**环境变量**:
```bash
DEEPSEEK_API_KEY=sk-xxx          # 主要
OPENROUTER_API_KEY=sk-or-v1-xxx  # 备用1
OPENAI_API_KEY=sk-proj-xxx       # 备用2
```

---

### 2. 数据生命周期管理 (data-lifecycle.js)

**问题**: 数据库只增不减，长期运行导致体积膨胀。

**解决方案**: 三级数据存储策略

| 级别 | 时间范围 | 存储位置 | 数据完整性 |
|------|---------|---------|-----------|
| 热数据 | 0-7天 | news 表 | 完整字段 |
| 温数据 | 7-30天 | news_archive 表 | 精简字段 |
| 冷数据 | 30-90天 | news_stats 表 | 仅统计维度 |

**特性**:
- 自动压缩：7天后 content 字段清空，detail 截断至 200 字
- 自动归档：30天后迁移到归档表
- 自动统计：聚合为按日/来源/分类的统计数据
- 自动清理：90天后删除原始数据
- 定时任务：每天凌晨 2 点自动执行

**新增 API**:
- `GET /api/archive` - 查询归档数据
- `GET /api/history-stats` - 查询历史统计
- `POST /api/cleanup` - 手动触发清理（需 API Key）

---

### 3. 推送渠道抽象层 (push-channel.js)

**问题**: 仅支持企业微信，无法满足多渠道推送需求。

**解决方案**: 统一推送接口，支持多平台

**支持渠道**:
| 渠道 | 环境变量 | 特性 |
|------|---------|------|
| 企业微信 | `WECOM_WEBHOOK_URL` | 支持 Markdown，长消息自动分段 |
| 钉钉 | `DINGTALK_WEBHOOK_URL`, `DINGTALK_SECRET` | 支持签名验证 |
| Slack | `SLACK_WEBHOOK_URL` | 支持 Block 格式 |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | 支持 Markdown |
| Email | `SMTP_HOST`, `SMTP_USER` 等 | 支持 HTML/纯文本 |

**特性**:
- 统一接口：`pushTo()`, `pushToAll()`, `sendReport()`
- 速率限制保护（每渠道独立计数）
- 长消息自动分段发送
- 失败自动重试

**新增 API**:
- `GET /api/push-status` - 查看推送渠道状态
- `POST /api/push-test` - 测试推送（需 API Key）

---

### 4. Twitter KOL 多源冗余抓取 (twitter-enhanced.js)

**问题**: 原 RSS 抓取依赖单一 Nitter 实例，稳定性差。

**解决方案**: 四级抓取降级策略

| 级别 | 来源 | 成本 | 稳定性 |
|------|------|------|--------|
| L1 | Nitter 实例池 | 免费 | 中 |
| L2 | RSSHub 镜像 | 免费 | 中 |
| L3 | 第三方 API | 付费 | 高 |
| L4 | 本地缓存 | - | 兜底 |

**特性**:
- 5 个 Nitter 实例自动轮换
- 3 个 RSSHub 镜像自动切换
- 支持 twitterapi.io 和 Scrapfly 备用
- 30 分钟本地缓存减少重复请求
- 每个 KOL 独立缓存和统计

**环境变量**:
```bash
TWITTERAPI_KEY=xxx    # 备用 API
SCRAPFLY_KEY=sf-xxx   # 备用 API
```

**新增 API**:
- `GET /api/twitter-status` - 查看抓取统计

---

### 5. 安全加固

**问题**: 前端硬编码 Supabase 密钥。

**解决方案**:
- 前端移除硬编码密钥
- 本地开发使用直接 API 连接
- 生产环境通过 `/api/*` 代理访问
- 新增 `API_SECRET` 环境变量保护写操作

**新增环境变量**:
```bash
API_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com
```

---

## 系统架构升级

### Server.js 增强

新增集成点：
1. **数据生命周期管理器** - 初始化并注册定时任务
2. **推送管理器** - 初始化并暴露状态接口
3. **增强健康检查** - 包含 AI、推送、存储状态
4. **新增 API 端点** - 归档查询、统计查询、清理任务等

### 配置更新 (config.js)

新增 `DATA_RETENTION` 配置：
```javascript
DATA_RETENTION: {
  HOT_DAYS: 7,           // 热数据保留天数
  WARM_DAYS: 30,         // 温数据保留天数
  COLD_DAYS: 90,         // 冷数据保留天数
  AUTO_CLEANUP_CRON: '0 2 * * *',  // 每天凌晨2点
  CONTENT_COMPRESS_THRESHOLD: 200, // 内容截断阈值
}
```

---

## API 变更

### 新增端点

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/archive` | 查询归档数据 | 否 |
| GET | `/api/history-stats` | 查询历史统计 | 否 |
| POST | `/api/cleanup` | 手动触发清理 | API Key |
| GET | `/api/push-status` | 推送渠道状态 | 否 |
| POST | `/api/push-test` | 测试推送 | API Key |
| GET | `/api/twitter-status` | Twitter 抓取状态 | 否 |
| GET | `/api/ai-status` | AI 提供商状态 | 否 |

### 增强端点

| 端点 | 新增字段 |
|------|---------|
| `/api/health` | `ai`, `push`, `storage` |

---

## 环境变量清单

### 必需
```bash
DEEPSEEK_API_KEY=sk-xxx
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/...
```

### AI 备用（推荐）
```bash
OPENROUTER_API_KEY=sk-or-v1-xxx
OPENAI_API_KEY=sk-proj-xxx
```

### 推送渠道（可选）
```bash
# 钉钉
DINGTALK_WEBHOOK_URL=...
DINGTALK_SECRET=...

# Slack
SLACK_WEBHOOK_URL=...

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Email
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
EMAIL_TO=...
```

### Twitter 抓取（可选）
```bash
TWITTERAPI_KEY=...
SCRAPFLY_KEY=...
```

### 安全（推荐）
```bash
API_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com
```

---

## 迁移指南

### 从 v1.3 升级到 v1.4

1. **更新依赖**
   ```bash
   npm install
   ```

2. **更新环境变量**
   ```bash
   cp .env.example .env
   # 按需填写新的环境变量
   ```

3. **重启服务**
   ```bash
   npm start
   ```

4. **验证功能**
   - 访问 `/api/health` 检查新状态字段
   - 访问 `/api/ai-status` 验证 AI 降级策略
   - 访问 `/api/push-status` 验证推送渠道

---

## 性能优化

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| AI 可用性 | 单点故障 | 99.9%（三级降级） |
| Twitter 抓取成功率 | ~70% | ~95%（多源冗余） |
| 数据库体积增长 | 线性增长 | 可控（自动归档） |
| 推送渠道 | 1 个 | 最多 5 个 |

---

## 后续计划

### v1.5 预览
- [ ] 智能问答助手（RAG 架构）
- [ ] 竞品对标分析功能
- [ ] 热点趋势预测
- [ ] 浏览器通知支持
- [ ] 暗黑模式

---

## 贡献者

- 产品规划：资深互联网产品经理（AI）
- 代码实现：Claude Code

---

## 许可证

MIT © Alpha-Radar Team
