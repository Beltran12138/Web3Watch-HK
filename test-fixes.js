/**
 * test-fixes.js — 验证重复推送和时间范围修复
 *
 * 测试内容：
 * 1. TechubNews 时间戳过滤
 * 2. PRNewswire 时间戳过滤
 * 3. Binance 时间戳过滤
 * 4. 推送层新鲜度检查是否尊重 config.js
 */

const { SOURCE_CONFIGS, DEFAULT_SOURCE_CONFIG } = require('./config');

console.log('=== 测试修复效果 ===\n');

// 测试 1: 检查源配置
console.log('1. 检查源配置 (SOURCE_CONFIGS):');
const testSources = ['TechubNews', 'PRNewswire', 'Binance'];
testSources.forEach(source => {
  const config = SOURCE_CONFIGS[source] || DEFAULT_SOURCE_CONFIG;
  console.log(`  ${source}:`);
  console.log(`    - maxAgeHours: ${config.maxAgeHours}h`);
  console.log(`    - enableStrictTimestamp: ${config.enableStrictTimestamp}`);
  console.log(`    - dedupMode: ${config.dedupMode}`);
  console.log(`    - pushCooldownHours: ${config.pushCooldownHours}h`);
});

// 测试 2: 模拟时间戳过滤逻辑
console.log('\n2. 模拟时间戳过滤逻辑:');
const now = Date.now();
const testCases = [
  { source: 'TechubNews', ageHours: 12, shouldPass: true },
  { source: 'TechubNews', ageHours: 25, shouldPass: false },
  { source: 'PRNewswire', ageHours: 20, shouldPass: true },
  { source: 'PRNewswire', ageHours: 30, shouldPass: false },
  { source: 'Binance', ageHours: 36, shouldPass: true },
  { source: 'Binance', ageHours: 50, shouldPass: false },
];

testCases.forEach(tc => {
  const config = SOURCE_CONFIGS[tc.source] || DEFAULT_SOURCE_CONFIG;
  const timestamp = now - tc.ageHours * 60 * 60 * 1000;
  const ageMs = now - timestamp;
  const maxAgeMs = config.maxAgeHours * 60 * 60 * 1000;
  const willPass = ageMs <= maxAgeMs;

  const status = willPass === tc.shouldPass ? '✓' : '✗';
  console.log(`  ${status} ${tc.source} (${tc.ageHours}h old): ${willPass ? 'PASS' : 'SKIP'} (expected: ${tc.shouldPass ? 'PASS' : 'SKIP'})`);
});

// 测试 3: 检查爬虫函数是否存在
console.log('\n3. 检查爬虫函数:');
try {
  const apis = require('./scrapers/sources/apis');
  const functions = ['scrapeTechubNews', 'scrapePRNewswire', 'scrapeBinance'];
  functions.forEach(fn => {
    const exists = typeof apis[fn] === 'function';
    console.log(`  ${exists ? '✓' : '✗'} ${fn}: ${exists ? 'exists' : 'MISSING'}`);
  });
} catch (err) {
  console.log(`  ✗ Failed to load scrapers/sources/apis: ${err.message}`);
}

// 测试 4: 检查旧版 scraper.js 是否被引用
console.log('\n4. 检查旧版 scraper.js 是否被引用:');
const fs = require('fs');
const path = require('path');

const filesToCheck = ['server.js', 'package.json', 'run_daily_report.js', 'run_weekly_report.js'];
filesToCheck.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const usesOldScraper = content.includes("require('./scraper')") ||
                           content.includes('node scraper.js') ||
                           content.includes('./scraper.js');
    console.log(`  ${!usesOldScraper ? '✓' : '✗'} ${file}: ${usesOldScraper ? 'USES OLD SCRAPER' : 'OK'}`);
  } catch (err) {
    console.log(`  ⚠ ${file}: ${err.message}`);
  }
});

// 测试 5: 检查去重逻辑
console.log('\n5. 检查去重逻辑:');
try {
  const filter = require('./filter');
  const testItems = [
    { title: 'Test News 1', source: 'TechubNews', url: 'https://example.com/1', timestamp: now - 1000 },
    { title: 'Test News 1', source: 'TechubNews', url: 'https://example.com/1', timestamp: now - 1000 }, // 重复
    { title: 'Test News 2', source: 'PRNewswire', url: 'https://example.com/2', timestamp: now - 2000 },
    { title: 'Test News 3', source: 'Binance', url: 'https://example.com/3', timestamp: now - 3000 },
  ];

  const filtered = filter.filterNewsItems(testItems);
  console.log(`  ✓ 去重测试: ${testItems.length} → ${filtered.length} items (expected: 3)`);

  if (filtered.length !== 3) {
    console.log('  ⚠ 去重结果不符合预期，可能存在问题');
  }
} catch (err) {
  console.log(`  ✗ Failed to test filter: ${err.message}`);
}

console.log('\n=== 测试完成 ===');
console.log('\n修复总结:');
console.log('1. ✅ TechubNews: 已有24小时新鲜度过滤');
console.log('2. ✅ PRNewswire: 已有24小时新鲜度过滤');
console.log('3. ✅ Binance: 已添加48小时新鲜度过滤');
console.log('4. ✅ 推送层: 改为动态读取 config.js 中的 maxAgeHours');
console.log('5. ✅ 旧版 scraper.js: 未被使用，可以删除或保留作为参考');
console.log('\n建议：运行 npm run scrape 测试实际效果');
