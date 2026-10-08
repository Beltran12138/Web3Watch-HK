# intel/ — 香港持牌机构情报（公开数据采集）

两个采集器，GitHub Actions 定时跑，结果写到 **`intel-data` 分支**（不进 master，周报 / 日报流程不受影响）。

| 采集器 | 工作流 | 频率 | 输出（intel-data 分支） |
|---|---|---|---|
| `sfc_snapshot.py` | `intel_sfc.yml` | 每天香港 00:00 | `sfc/current/`（全量快照）· `sfc/firms.json`（机构摘要）· `sfc/diffs/<日期>.json/.md` · `sfc/signals.jsonl` |
| `news_radar.py` | `intel_news.yml` | 每 2 小时 | `news/radar_news.json` |

本地跑：`pip install -r intel/requirements.txt`，然后 `INTEL_DATA=<intel-data 检出目录> python intel/news_radar.py`。

## 数据从哪来

- **SFC 公共登记册**：`apps.sfc.hk/publicregWeb/searchByRaJson` 按牌照类型 × 首字母拉名单（含 VATP），再逐家抓牌照条件页（`condData`）和负责人员页（`rorawData`；银行是注册机构，走 `/ri/` 和 `eoData`）
- **新闻**：Google 新闻 RSS（简中 / 繁中 / 英文版）、Bing 新闻 RSS（必须带 `qft=sortbydate="1"`，否则返回旧闻；带 `setlang`/`cc` 会返回网页）、SFC 新闻稿 RSS。只存标题、媒体、链接、时间

## 口径

- **VA 条件**：牌照条件原文里出现 virtual asset dealing / related asset management / advisory / introducing clients to VATP。条件的生效日 ≠ 首次获批日（2026 年 SFC 换发 VA 条款，覆盖了旧日期）；没有 VA 条件 ≠ 不做 VA
- **比对**：任一边条件页没抓到的机构，不比对条件和人员；条件页不完整时不替换快照、直接失败
- **内地母品牌**（`brands.py`）：中文名前缀匹配 + 英文名整词匹配，两路一致为高置信。词典只覆盖头部机构
- **新闻合并**：标题字二元组 Jaccard ≥ 0.3 且日期相差 ≤ 3 天视为同一事件；机构匹配只看标题，不看媒体名

## 噪声基线

2026-10-07 → 10-08 两份全量快照比对：0 条信号、0 家跳过（合成 7 处变化的测试 7/7 检出）。
