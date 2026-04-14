# Alpha-Radar | 香港 Web3 产品行研情报系统

> 面向加密交易所产品研究团队的内部情报工具 — 自动聚合香港合规所与头部离岸所动态，AI 提炼竞品洞察，每日定时推送至企业微信

![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 📖 项目简介

Alpha-Radar 是一个**为产品/行研团队设计的内部情报系统**，聚焦两个核心场景：

1. **香港合规赛道监控** — SFC 政策、VATP 牌照进展、OSL/HashKey/Exio 等香港持牌所动态
2. **头部离岸所产品动作** — Binance/OKX/Bybit 等 8 家头部所的合规、产品、战略动向

系统通过 GitHub Actions 全自动运行（无需服务器），抓取 **25 个数据源**，使用 **DeepSeek AI** 进行分类与摘要，每日 18:00 推送日报至**企业微信群**。

### 核心能力

| 能力 | 描述 |
|------|------|
| 🔍 **多源抓取** | 25 个数据源：8 家交易所公告 + 5 家香港合规所 + 媒体/KOL/预测市场 |
| 🤖 **AI 分类** | DeepSeek V3 主力 + OpenRouter 备用 + 规则引擎兜底，三级降级策略 |
| 📊 **宏观市场背景** | 每日自动拉取 BTC/ETH 价格、总市值、BTC 主导率、恐惧贪婪指数 |
| 📰 **AI 日报** | 每日 18:00 推送，含宏观背景 + 历史趋势对比 + 重点动态分析 |
| 🏢 **竞品动态矩阵** | 周报按竞品来源分组，直接看每家机构本周做了什么 |
| 🧠 **历史趋势记忆** | AI 总结可参照近期行业共识趋势，做纵向对比而非每次从零开始 |
| 🗄️ **双存储** | SQLite 本地 + Supabase 云端，热/温/冷三级数据生命周期管理 |

---

## 📐 架构

```
GitHub Actions (全自动调度，无需服务器)
│
├── 每 15 分钟  →  scrapers/   抓取 25 个数据源
│                  filter.js   清洗 + 去重
│                  AI 分类     business_category / alpha_score / bitv_action
│                  db.js       写入 SQLite + Supabase
│
├── 每日 18:00  →  macro-market.js  拉取宏观数据（CoinGecko + Fear&Greed）
│                  insightDAO        读取历史趋势记忆
│                  report.js         生成日报
│                  wecom.js          推送企业微信
│
└── 每周五 18:00 →  report.js        生成周报（AI总结 + 竞品矩阵 + 分类附录）
                    wecom.js          推送企业微信
```

---

## 📊 数据源列表（25 个）

### 香港合规所（5 家）
OSL、HashKey Group、HashKey Exchange、Exio、TechubNews（HashKey 媒体）

### 头部离岸所（8 家）
Binance、OKX、Bybit、Gate、MEXC、Bitget、HTX、KuCoin

### 监管机构（1 个）
SFC（香港证监会官网）

### Web3 媒体（3 家）
BlockBeats、TechFlow、WuBlock、PR Newswire

### KOL Twitter（5 位）
吴硕、Phyrex、Justin Sun、XieJiayin、Twitter AB

### 预测市场（2 个）
Polymarket Breaking、Polymarket China

---

## 📰 报告示例

### 日报结构
```
📋 Alpha-Radar 行业日报 | 2026-03-25

📊 今日数据概览
> 抓取 124 条 | 重要 18 条 | AI摘要 96 条 | 来源 14 个

🌐 宏观市场背景
> BTC $84,230 ▲2.1%  |  ETH $3,180 ▼0.8%
> 总市值 $2.9T ▲1.8%  |  BTC 主导率 57.3%
> 市场情绪 中性 😐 (52)

---
[AI 今日简报，含历史趋势对比]

---
🔍 重点动态分析
  合规 (3)  /  产品 (5)  /  投融资 (2)  ...
```

### 周报结构
```
📰 Alpha-Radar 行业周报 | 03/17 ~ 03/21

[AI 本周总结论 + 竞品格局 + BitV 战略建议]

---
🏢 竞品动态矩阵 | 本周各主要玩家行动汇总

🏛️ HashKey Exchange · 3条重要动态
  🔥 获批向零售开放加密服务  `合规` `95`
     > SFC 批准其面向零售投资者提供服务，市场影响显著。
     > 💡 立即研究其零售开户流程，评估对我司获客策略冲击。

🌐 Binance · 2条重要动态
  ⭐ 推出新合规框架  `合规` `78`
  ...

---
📌 本周分类策略详情（按业务线）
```

---

## 🚀 部署（GitHub Actions，无需服务器）

### 1. Fork 仓库

```bash
# Fork 本仓库到你的 GitHub 账号
```

### 2. 配置 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret | 必需 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek AI API Key（主要 AI 提供商） |
| `WECOM_WEBHOOK_URL` | ✅ | 企业微信机器人 Webhook URL |
| `SUPABASE_URL` | 推荐 | Supabase 项目 URL（数据云端备份） |
| `SUPABASE_KEY` | 推荐 | Supabase Publishable Key |
| `OPENROUTER_API_KEY` | 可选 | AI 备用提供商（DeepSeek 故障时使用） |

### 3. 启用 GitHub Actions

仓库 Actions 页面 → 手动触发一次 `CI / Scrape` 验证配置。

之后自动按以下 cron 运行：
- **每 15 分钟**：抓取数据
- **每日 18:00 (北京)**：推送日报
- **每周五 18:00 (北京)**：推送周报

### 4. 本地开发（可选）

```bash
npm install
cp .env.example .env
# 编辑 .env 填入 API Key

# 测试日报生成（不推送）
npm run daily-report:dry

# 测试周报生成（不推送）
npm run weekly-report:dry

# 手动触发抓取
npm run scrape
```

---

## ⚙️ 关键配置（`config.js`）

```js
// 推送过滤规则
WECOM_BLOCK_SOURCES = ['TechFlow', 'BlockBeats', 'Poly-*', 'KOL']  // 不推送实时通知
HK_SOURCES = ['OSL', 'HashKey*', 'Exio', 'TechubNews']             // 全量推送
EXCHANGE_EXCLUDE_KEYWORDS = ['listing', '上线', '新币', ...]        // 排除普通上币公告

// AI 评分标准
alpha_score 90-100: SFC 政策突变、重要牌照获批/撤销、主流所重大合规处罚
alpha_score 70-89:  香港市场重要业务进展、RWA/稳定币新规、头部所战略调整
alpha_score 40-69:  普通业务上线、常规行业新闻
alpha_score < 40:   常规市场波动（不进入报告）

// 报告推送时间
DAILY_REPORT:  每日 18:00 北京时间（cron: 0 10 * * *）
WEEKLY_REPORT: 每周五 18:00 北京时间（cron: 0 10 * * 5）
```

---

## 📁 主要文件说明

```
alpha-radar/
├── config.js              # 全局配置（数据源规则、AI 参数、推送规则）
├── scrapers/
│   ├── index.js           # 爬虫调度器
│   └── sources/
│       ├── apis.js        # HTTP/API 类爬虫（OKX/Binance/HashKey 等）
│       ├── puppeteer.js   # 浏览器渲染类爬虫
│       └── twitter-enhanced.js  # Twitter KOL 多源冗余抓取
├── ai-enhanced.js         # AI 分类/摘要（三级降级策略）
├── filter.js              # 噪声过滤 + 去重
├── db.js                  # SQLite + Supabase 双存储
├── macro-market.js        # 宏观市场数据（CoinGecko + Fear&Greed）
├── report.js              # 日报/周报生成（含竞品矩阵、历史记忆）
├── wecom.js               # 企业微信推送
├── dao.js                 # 数据访问层（含 Insights 记忆系统）
└── .github/workflows/
    ├── ci.yml             # 每 15 分钟抓取
    ├── daily_report.yml   # 每日日报
    └── weekly_report.yml  # 每周周报
```

---

## 📝 更新日志

### v2.2.0 (2026-03-25)
- 📊 **宏观市场背景**：日报新增 BTC/ETH 价格、总市值、BTC 主导率、恐惧贪婪指数面板
- 🏢 **竞品动态矩阵**：周报新增按竞品来源分组的动态矩阵视图
- 🧠 **历史趋势记忆**：日报 AI 总结注入近期行业趋势，支持纵向对比
- 🔍 **WeCom errcode 检查**：推送失败不再静默，日志中直接显示企微 API 错误码

### v2.1.0 (2026-03-23)
- 🔧 **better-sqlite3 编译修复**：彻底解决 GitHub Actions Node.js 版本导致的 NMV 不匹配问题
- 🚫 **移除"高能预警"推送**：停止单条实时推送，仅保留日报/周报汇总推送

### v1.4.0 (2026-03-13)
- 🤖 AI 三级降级策略
- 📦 数据生命周期管理（热/温/冷三级存储）
- 📢 多渠道推送（企业微信/钉钉/Slack/Telegram/Email）
- 🐦 Twitter 多源冗余抓取

---

## 📄 License

MIT
