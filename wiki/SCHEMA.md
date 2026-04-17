# Wiki Schema — BitV 产品行研知识库

## Domain
香港 Web3 双牌照平台（BitV）的产品行研情报库。覆盖竞品分析、监管动态、RWA业务方向、市场趋势及核心产品切入机会。

## Conventions

### 页面类型（Tags）
- `#竞品` — 竞争对手分析（HashKey、OSL、VDX 等）
- `#监管` — SFC/VATP 监管动态、牌照进展
- `#RWA` — 代币化资产、RWA 项目动态
- `#产品` — BitV 产品策略、功能优先级
- `#市场` — 香港 Web3 市场趋势、用户行为

### 章节约定
每个 wiki 页面必须包含：
- **基本数据** — 核心指标（市占率、融资额等）
- **近期重要动作** / **最新监管动态** / **最新 RWA 动态** — 自动更新区（wiki-updater.py 写入）
- **高 Alpha 信号** — alpha_score ≥ 80 的战略信号
- **弱点（我司机会）** / **核心切入机会** — BitV 战略意义

### 自动更新规则
wiki-updater.py 每15分钟从 Supabase 抓取新闻，追加到对应 section：
- `source in (HashKeyExchange, HashKeyGroup)` → 竞品-HashKey.md
- `source == OSL` → 竞品-OSL.md
- `business_category 含 合规/监管/稳定币` → 监管-香港SFC.md
- `business_category 含 RWA` → 业务方向-RWA.md
- `alpha_score ≥ 80` → 核心切入机会.md

### 交叉引用格式
`[[页面名称]]` — 如 `[[竞品-HashKey]]`、`[[监管-香港SFC]]`

### 时间格式
`[YYYY-MM-DD]` — 所有新闻条目带日期前缀

## Current Pages
- `竞品-HashKey.md` — HashKey Exchange/Group 竞品分析
- `竞品-OSL.md` — OSL 竞品分析
- `监管-香港SFC.md` — 香港 SFC/VATP 监管图谱
- `业务方向-RWA.md` — RWA 代币化业务方向
- `市场趋势.md` — 市场趋势速览
- `核心切入机会.md` — BitV 产品优先级矩阵（核心文件）

## Query Patterns
- 竞品问题 → 先读 竞品-HashKey.md 或 竞品-OSL.md
- 监管问题 → 先读 监管-香港SFC.md
- "该做什么" → 必读 核心切入机会.md
- 高 alpha 信号 → 核心切入机会.md 的"高 Alpha 信号"section
