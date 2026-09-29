# 精选评测

用人工周报当标准答案，评测「哪些新闻该进周报」的判断。做法参考 [AIHOT](https://github.com/KKKKhazix/AIHOT) 的 `docs/selection.md`：带开发集和留出集，门槛只在开发集上选。

标准答案是内部数据，放在仓库外的一个目录（下文 `<dir>`），不入库。

## 流程

```bash
node scripts/build-gold.js --dir=<dir>                                   # 1. 生成 gold.jsonl
node --env-file=.env scripts/gold-same-event.js --dir=<dir>              # 2. 找出标成 reject、其实是周报同一件事的报道
node scripts/build-gold.js --dir=<dir>                                   # 3. 带上第 2 步和人工改标重建
node --env-file=.env scripts/eval-selection.js --dir=<dir> --judges=rules,legacy,llm --label="说明"
```

报告写到 `<dir>/eval/`（`.md` 看，`.json` 留档）。模型调用按「模型 + 提示词 + 输入」缓存在 `<dir>/.cache/`，重跑只为改过的部分花钱。

## 样本怎么来的

| 标注 | 来源 |
|---|---|
| `select` | 周报条目在数据库里的首条匹配。模型看的是抓到的原文，不是周报改写后的标题 |
| `either`（不计分） | 同一条目的其他匹配、无法确认的条目、与正例标题几乎相同的报道、模型判为周报同一件事的报道 |
| `reject` | 周报时间窗内其余新闻，分三层抽样：规则会放行的、提到重点机构的、其余。每条带 `weight`（该层池大小 ÷ 抽样数） |

切分按周报期次：`--holdout-from`（默认 2026-07-24）之前为开发集，之后为留出集。

人工改标写在 `<dir>/labels_override*.csv`（`news_id,decision,note`，decision 为 `select` / `reject` / `either`），重建时生效。

## 怎么读结果

- **查全**：周报条目里，被判为入选的比例。它的前提是数据库里抓到了，端到端还要乘上报告开头的「找得到」比例。
- **查准（加权）**：按抽样权重还原到「时间窗内全部新闻」后，判为入选的里面有多少进了周报。未加权的查准只描述样本本身，偏乐观。
- **条/周**：按加权估计，每周会判出多少条入选。
- 标准答案是「进没进周报」。推群的范围比周报宽，所以 `rules-push` 的查准天然偏低，它的查全才是有效读数。
- 「没进周报」不等于「不该进」：误选里有一部分是周报当时漏收的。先人工复核这些条目，再下结论。
- `lib/tiering.js` 是在同一批周报上调出来的，它在留出集上的数字也是样本内的。

## 改标准的顺序

先看开发集的判错条目，改 `prompts/selection-score.md` 或规则，再跑。门槛只能整体移动，解决不了「哪一类判错了」。留出集只在最后看一次。
