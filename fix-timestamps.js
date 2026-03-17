const db = require('./db');

// 查找无效时间戳的记录
const stmt = db.db.prepare('SELECT id, title, timestamp FROM news WHERE timestamp IS NULL OR timestamp <= 0 LIMIT 10');
const rows = stmt.all();

if (rows.length === 0) {
  console.log('✓ 所有记录时间戳正常');
} else {
  console.log(`发现 ${rows.length} 条记录时间戳无效:`);
  rows.forEach(r => {
    console.log(`ID ${r.id}: ts=${r.timestamp}, title=${r.title.substring(0, 50)}...`);
  });
  
  // 批量修复
  const updateStmt = db.db.prepare('UPDATE news SET timestamp = ? WHERE id = ?');
  const tx = db.db.transaction((records) => {
    records.forEach(r => updateStmt.run(Date.now(), r.id));
  });
  
  tx(rows);
  console.log(`\n✓ 已修复 ${rows.length} 条记录的时间戳`);
  
  // 验证
  const verify = db.db.prepare('SELECT COUNT(*) as n FROM news WHERE timestamp <= 0').get();
  console.log(`✓ 剩余无效时间戳：${verify.n}`);
}

db.db.close();
