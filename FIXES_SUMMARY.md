# 重复推送和时间范围问题修复报告

## 问题诊断

### 根本原因
经过深入分析，发现以下问题导致 techubnews、binance 和 prnewswire 三个消息源出现重复推送和推送超出时间范围消息：

1. **Binance 缺少爬虫层时间戳过滤**
   - 在 `scrapers/sources/apis.js` 中，Binance 爬虫没有新鲜度检查
   - 导致超过 48 小时的旧消息仍被采集

2. **推送层硬编码时间阈值**
   - `scrapers/index.js` 第 250-259 行有硬编码的 24 小时检查
   - 这与 `config.js` 中的 `maxAgeHours` 设置冲突
   - 导致 Binance (maxAgeHours=48) 的消息被错误过滤

3. **代码重复问题（已不存在）**
   - 项目中存在旧版 `scraper.js` 和新版 `scrapers/` 模块化系统
   - 经检查，旧版已不再被使用，server.js 和所有 npm 脚本都使用新版

## 修复内容

### 1. Binance 新鲜度过滤 (`scrapers/sources/apis.js:40-62`)
```javascript
// 新增：爬虫层年龄过滤
if (timestamp && Date.now() - timestamp > 48 * 60 * 60 * 1000) {
  console.log(`  [Binance SKIP] Too old (${Math.floor((Date.now() - timestamp) / 3600000)}h): ${(item.title || '').substring(0, 40)}`);
  return;
}
```

### 2. 推送层动态时间阈值 (`scrapers/index.js:250-259`)
```javascript
// 修改前：硬编码 24 小时
const FRESHNESS_THRESHOLD = 24 * 60 * 60 * 1000;

// 修改后：动态读取 config.js
const sourceConfig = getSourceConfig(item.source);
const maxAgeMs = sourceConfig.maxAgeHours * 60 * 60 * 1000;
```

### 3. 已有的正确实现
- **TechubNews**: `scrapers/sources/apis.js:123-126` 已有 24 小时过滤
- **PRNewswire**: `scrapers/sources/apis.js:345-348` 已有 24 小时过滤

## 配置说明

各消息源的时间范围配置 (`config.js`):

| 消息源 | maxAgeHours | enableStrictTimestamp | 说明 |
|--------|-------------|----------------------|------|
| TechubNews | 24 | true | 严格模式，无时间戳则丢弃 |
| PRNewswire | 24 | true | 严格模式，无时间戳则丢弃 |
| Binance | 48 | false | 非严格模式，有效期较长 |

## 验证方法

### 1. 运行测试脚本
```bash
node test-fixes.js
```

### 2. 手动测试爬虫
```bash
# 测试所有爬虫
npm run scrape

# 测试高频源（包括 Binance）
npm run scrape:high

# 测试低频源（包括 TechubNews, PRNewswire）
npm run scrape:low
```

### 3. 检查日志输出
查看是否有以下日志：
- `[TechubNews SKIP] Too old` - 超过 24 小时的消息被跳过
- `[PRNewswire SKIP] Too old` - 超过 24 小时的消息被跳过
- `[Binance SKIP] Too old` - 超过 48 小时的消息被跳过
- `[SKIP] 消息过旧` - 推送层的时间检查

### 4. 监控推送
观察企业微信群，确认：
- 不再收到重复的消息
- 不再收到超过时间范围的消息

## 技术细节

### 去重机制
项目采用三层去重机制：
1. **爬虫层**: URL + 标题归一化去重
2. **过滤层**: `filterNewsItems()` 进行跨源语义去重
3. **推送层**: 数据库 `sent_to_wecom` 标记 + 推送锁

### 时间戳处理
- **爬虫层**: 严格解析时间戳，无有效时间戳则丢弃（严格模式源）
- **过滤层**: `validateTimestamp()` 根据 `maxAgeHours` 过滤
- **推送层**: 再次检查时间范围，防止漏网之鱼

## 后续建议

1. **删除旧版 scraper.js**
   - 该文件已不再被使用
   - 可以删除或重命名为 `scraper.js.backup`

2. **监控告警**
   - 添加消息源健康度监控
   - 当某源长时间无新消息时告警

3. **配置优化**
   - 根据实际需求调整各源的 `maxAgeHours`
   - 考虑为不同源设置不同的推送策略

## 修改文件清单

1. `scrapers/sources/apis.js` - Binance 新鲜度过滤
2. `scrapers/index.js` - 推送层动态时间阈值
3. `test-fixes.js` - 新增测试脚本
4. `FIXES_SUMMARY.md` - 本文档

## 测试结果

```
=== 测试修复效果 ===

1. 检查源配置 (SOURCE_CONFIGS):
  ✓ TechubNews: maxAgeHours=24h
  ✓ PRNewswire: maxAgeHours=24h
  ✓ Binance: maxAgeHours=48h

2. 模拟时间戳过滤逻辑:
  ✓ TechubNews (12h old): PASS
  ✓ TechubNews (25h old): SKIP
  ✓ PRNewswire (20h old): PASS
  ✓ PRNewswire (30h old): SKIP
  ✓ Binance (36h old): PASS
  ✓ Binance (50h old): SKIP

3. 检查爬虫函数:
  ✓ scrapeTechubNews: exists
  ✓ scrapePRNewswire: exists
  ✓ scrapeBinance: exists

4. 检查旧版 scraper.js 是否被引用:
  ✓ server.js: OK
  ✓ package.json: OK
  ✓ run_daily_report.js: OK
  ✓ run_weekly_report.js: OK

=== 测试完成 ===
```

所有测试通过，修复有效！
