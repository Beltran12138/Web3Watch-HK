---
name: hk-market-intel
description: 香港 Web3 市场情报查询。三阶段推理：Wiki背景知识 → 缺口分析 → 定向补充搜索 → 三段式输出。当用户询问竞品动态（HashKey/OSL）、监管进展（SFC/VATP）、RWA、稳定币、市场趋势、产品策略时触发。
version: 3.0.0
author: BitV Product Team
license: MIT
metadata:
  hermes:
    tags: [HashKey, OSL, SFC, RWA, 监管, 竞品, 稳定币, 市场, BitV, 行研, 香港, Web3]
---

# HK Market Intel — 三阶段情报推理

## 阶段 1：Wiki 知识库（每次必读）

### 文件路径映射

| 问题类型 | 读取文件 |
|---------|---------|
| HashKey 相关 | `/mnt/c/Users/lenovo/alpha-radar/wiki/竞品-HashKey.md` |
| OSL 相关 | `/mnt/c/Users/lenovo/alpha-radar/wiki/竞品-OSL.md` |
| 监管/SFC/稳定币 | `/mnt/c/Users/lenovo/alpha-radar/wiki/监管-香港SFC.md` |
| RWA/代币化 | `/mnt/c/Users/lenovo/alpha-radar/wiki/业务方向-RWA.md` |
| 产品策略/Tier | `/mnt/c/Users/lenovo/alpha-radar/wiki/核心切入机会.md` |
| 全局概览 | `/mnt/c/Users/lenovo/alpha-radar/wiki/市场趋势.md` |

读完后**内部评估**：
- Wiki 覆盖率 ≥ 70%？
- 信息时效 ≤ 30天？

→ 两者都是：直接进阶段 3  
→ 任一否定：进阶段 2

---

## 阶段 2：补充数据（按需）

### 2A 实时新闻（缓存，无 token 消耗）

```bash
cat /root/.hermes/market-intel-cache.md
```

### 2B 定向网络搜索（仅当缓存仍不足时）

**搜索词从缺口分析导出**，示例：
- "HashKey ETF 2026 latest" （wiki 有基本信息但缺近期 ETF 进展）
- "香港 SFC 稳定币牌照 2026" （wiki 监管章节超过 30 天未更新）
- "OSL institutional 2026 announcement"

```bash
# 使用 duckduckgo-search 技能
ddgs text -k "SEARCH_QUERY" -r wt-wt -m 5
```

**限制**：最多 2 次搜索，搜索词必须精确对应缺口。

### 2C 深度竞品调研（仅需要时）

使用 company-research-web-scraping 技能抓取官网。

---

## 阶段 3：综合输出

整合 Wiki 结构化知识 + 最新数据，**必须使用三段式格式**：

```
📡 **事件速览**
• [来源] 标题（alpha分 或 日期）
  └ 摘要（1-2句）

📚 **战略背景**
（Wiki 来源的结构化判断，注明文件名，50-100字）

💡 **BitV 建议**
• 建议1（来自核心切入机会.md 的可执行行动）
• 建议2（可选）
```

字数 ≤ 400 字，注明信息来源（wiki / 缓存 / 搜索）。

---

## Supabase 直查（可选，当缓存不满足时）

```bash
source /root/.hermes/.env

# 按关键词查（替换 KEYWORD）
curl -s "$SUPABASE_URL/rest/v1/news?select=title,detail,source,alpha_score,created_at&title=ilike.*KEYWORD*&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# 高 alpha 战略信号
curl -s "$SUPABASE_URL/rest/v1/news?select=title,detail,source,alpha_score,bitv_action,created_at&alpha_score=gte.85&order=alpha_score.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
