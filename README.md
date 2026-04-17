# Web3Watch HK | 香港 Web3 行研情报系统

> 实时数据 × 知识编译 × 会学习的行研 Agent — 企业微信直接问，战略建议即时出

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 🏗️ 系统架构

```
实时数据（25个数据源）
    ↓ GitHub Actions 每15分钟抓取
Supabase 新闻库（DeepSeek alpha_score 评分）
    ↓ wiki-updater.py 每小时触发
行研知识库（Obsidian Wiki + Notion 档案）
    ↓ fetch-market-context.sh 每15分钟预缓存
Hermes Agent（SOUL.md + llm-wiki + holographic memory）
    ↓ WeCom 企业微信
产品团队直接可用（三段式：事件速览 → 战略背景 → BitV建议）
```

---

## 📖 项目简介

**Web3Watch HK** 是 BitV 产品团队的香港 Web3 行研情报系统，核心能力：

1. **实时数据监控** — SFC 政策、VATP 牌照、HashKey/OSL 竞品动态
2. **知识自动编译** — 新闻触发 wiki 更新（Karpathy LLM Wiki 模式）
3. **智能 Q&A Bot** — 企业微信行研 Bot，wiki-first 查询，三段式输出

---

## ✨ 核心能力

| 能力 | 描述 |
|------|------|
| 🔍 **多源抓取** | 25 个数据源：8家交易所公告 + 5家香港合规所 + 媒体/KOL/预测市场 |
| 🤖 **AI 评分** | DeepSeek V3 alpha_score 评分，≥65分自动进入行研流水线 |
| 📚 **Wiki 自动更新** | 新闻入库 → AI摘要 → 追加到对应wiki文件（每小时运行） |
| 💬 **行研 Q&A Bot** | Hermes Agent + 企业微信，wiki-first + Supabase + Notion三层知识 |
| 🧠 **持久化记忆** | holographic memory，跨会话学习用户提问习惯 |
| 📊 **日报推送** | 每日 18:00 推送，含宏观背景 + 竞品动态 + 战略建议 |
| 🗂️ **Notion 集成** | 5个核心产品档案页面（MVP优先级、OTC PRD、竞品分析等）实时注入 |
| 🗄️ **双存储** | SQLite 本地 + Supabase 云端 |

---

## 🧩 核心组件

### 1. 数据采集层（GitHub Actions）
- **触发频率**: 每15分钟
- **数据源**: `sources.yaml`，25个来源
- **AI 处理**: DeepSeek V3 分类 + alpha_score 评分
- **存储**: Supabase `news` 表

### 2. 知识编译层（Wiki）

**目录**: `wiki/`

| 文件 | 内容 |
|------|------|
| `SCHEMA.md` | wiki约定、自动更新规则 |
| `index.md` | 全局索引 |
| `竞品-HashKey.md` | HashKey Exchange/Group 竞品分析 |
| `竞品-OSL.md` | OSL 竞品分析 |
| `监管-香港SFC.md` | SFC/VATP 监管图谱 |
| `业务方向-RWA.md` | RWA 代币化机会 |
| `核心切入机会.md` | BitV 产品优先级矩阵（Tier1/2/3） |
| `市场趋势.md` | 市场趋势速览 |

**自动更新脚本**: `scripts/wiki-updater.py`
- 每小时运行，读取 Supabase 新增高 alpha 新闻
- DeepSeek 生成摘要，追加到对应 wiki section
- 状态追踪：`scripts/.wiki-update-state.json`

### 3. 行研 Agent 层（Hermes）

**平台**: Hermes Agent v0.10.0 (NousResearch)，运行在 WSL2 Ubuntu

**配置文件**（WSL2: `~/.hermes/`）:
- `SOUL.md` — 系统核心指令，wiki-first 查询路径
- `config.yaml` — DeepSeek 模型 + WeCom 平台 + holographic memory
- `.env` — API keys（Supabase / Notion / DeepSeek / WeCom）
- `skills/hk-market-intel/SKILL.md` — 自定义行研技能
- `market-intel-cache.md` — 预缓存（每15分钟刷新）
- `fetch-market-context.sh` — 缓存刷新脚本（Supabase + Notion）

**启用的技能**:
- `hk-market-intel` — 自定义：Supabase查询 + Wiki读取 + 三段式输出
- `obsidian` — 原生 vault 读写
- `llm-wiki` — Karpathy 模式知识编译维护
- `company-research-web-scraping` — 深度竞品调研
- `duckduckgo-search` — 免费网络搜索（官方）

**记忆系统**: holographic memory（本地 SQLite，跨会话学习）

### 4. Notion 产品档案集成

集成 5 个核心产品调研页面（每15分钟刷新进缓存）：
- 一站式平台MVP优先级 & 香港证券市场切入点
- 核心调研结论
- 香港券商业务全景
- 托管业务产品方案与竞对商业模式
- OTC商业模式 & 竞品分析

---

## 🤖 行研 Bot 回答格式

```
📡 事件速览
• [来源] 标题（alpha分）
  └ 摘要

📚 战略背景
（来自 Wiki 的关键判断）

💡 BitV 建议
• 建议1（可执行）
• 建议2
```

**触发词**: HashKey、OSL、竞品、监管、SFC、RWA、稳定币、市场趋势、产品建议

---

## 🚀 快速启动

### 前置条件
- WSL2 Ubuntu 24.04
- Node.js 18+（GitHub Actions 数据采集）
- Python 3.11+（Hermes Agent）

### 启动 Hermes Gateway

```bash
# WSL2 中运行
source ~/.hermes/.env
nohup hermes gateway run > ~/.hermes/logs/gateway.log 2>&1 &
```

**开机自启**: `C:\Users\lenovo\start-hermes.bat` 已放入 Windows 启动文件夹

### 手动刷新缓存

```bash
~/.hermes/fetch-market-context.sh
```

### 手动更新 Wiki

```bash
cd /mnt/c/Users/lenovo/alpha-radar
python3 scripts/wiki-updater.py
```

---

## ⏱️ 定时任务（WSL2 crontab）

| 任务 | 频率 | 说明 |
|------|------|------|
| `fetch-market-context.sh` | 每15分钟 | 刷新 Supabase+Notion 缓存，无 token 消耗 |
| `wiki-updater.py` | 每小时 | 新闻→Wiki 自动更新，调用 DeepSeek |

---

## 🗂️ 目录结构

```
alpha-radar/
├── wiki/                    # 行研知识库（llm-wiki 格式）
│   ├── SCHEMA.md
│   ├── index.md
│   ├── log.md
│   ├── 竞品-HashKey.md
│   ├── 竞品-OSL.md
│   ├── 监管-香港SFC.md
│   ├── 业务方向-RWA.md
│   ├── 核心切入机会.md
│   └── 市场趋势.md
├── scripts/
│   └── wiki-updater.py      # 新闻触发 wiki 自动更新
├── skills/
│   └── hk-market-intel.md   # Hermes 自定义技能（Windows 副本）
├── scrapers/                # 25个数据源抓取器
├── sources.yaml             # 数据源配置
└── .github/workflows/
    ├── sync_wiki.yml        # 每周同步 hk-web3-wiki
    └── ...
```

---

## 🔗 相关仓库

- **[hk-web3-wiki](https://github.com/Beltran12138/hk-web3-wiki)** — 公开行研知识库（Docsify 静态站）
- **[Web3Watch-HK](https://github.com/Beltran12138/Web3Watch-HK)** — 主系统仓库

---

## 📝 更新日志

### v3.0.0（2026-04-17）
- ✅ Hermes Agent + WeCom 行研 Q&A Bot 上线
- ✅ wiki-updater.py：新闻触发 wiki 自动更新（DeepSeek 生成摘要）
- ✅ Notion 产品档案集成（5个核心页面）
- ✅ SOUL.md wiki-first 查询路径
- ✅ holographic memory 跨会话记忆
- ✅ llm-wiki / obsidian / duckduckgo-search 技能启用
- ✅ SCHEMA.md + index.md + log.md wiki 结构初始化

### v2.2.0（2026-03）
- 日报推送系统
- Supabase 双存储
- DeepSeek alpha_score 评分
