const db = require('./db');

console.log('=== 数据清洗效果验证 ===\n');

// 1. 统计信息
const stats = db.db.prepare('SELECT COUNT(*) as total FROM news').get();
console.log(`总记录数：${stats.total}`);

// 2. 时间戳有效性
const tsValid = db.db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp > 0').get();
const tsInvalid = db.db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp IS NULL OR timestamp <= 0').get();
console.log(`\n时间戳统计:`);
console.log(`  有效：${tsValid.n} (${((tsValid.n/stats.total)*100).toFixed(2)}%)`);
console.log(`  无效：${tsInvalid.n}`);

// 3. 业务分类分布
const cats = db.db.prepare("SELECT business_category, COUNT(*) as n FROM news WHERE business_category != '' GROUP BY business_category ORDER BY n DESC LIMIT 5").all();
console.log(`\n业务分类 TOP5:`);
cats.forEach(c => console.log(`  ${c.business_category}: ${c.n}`));

// 4. 数据源分布
const sources = db.db.prepare('SELECT source, COUNT(*) as n FROM news GROUP BY source ORDER BY n DESC LIMIT 5').all();
console.log(`\n数据源 TOP5:`);
sources.forEach(s => console.log(`  ${s.source}: ${s.n}`));

// 5. 重要新闻比例
const important = db.db.prepare('SELECT COUNT(*) as n FROM news WHERE is_important=1').get();
console.log(`\n重要新闻：${important.n} (${((important.n/stats.total)*100).toFixed(2)}%)`);

db.db.close();
console.log('\n✓ 数据质量良好');
