const db = require('./db');

// 查看几个示例标题
const stmt = db.db.prepare('SELECT id, title FROM news ORDER BY id DESC LIMIT 5');
const rows = stmt.all();
console.log('最新 5 条新闻标题:');
rows.forEach(r => {
  console.log(`ID ${r.id}: ${r.title.substring(0, 80)}`);
});

// 检查是否有明显的乱码特征
const checkStmt = db.db.prepare("SELECT id, title FROM news WHERE title LIKE '%%' OR title LIKE '%鏁' LIMIT 5");
const mojibake = checkStmt.all();
console.log('\n包含替换字符的标题:');
if (mojibake.length === 0) {
  console.log('未检测到明显乱码');
} else {
  mojibake.forEach(r => console.log(`ID ${r.id}: ${r.title.substring(0, 60)}`));
}

// 统计包含常见乱码字符的数量
const countStmt = db.db.prepare("SELECT COUNT(*) as n FROM news WHERE title LIKE '%%' OR title LIKE '%鏁' OR title LIKE '%'");
const count = countStmt.get();
console.log(`\n疑似乱码标题总数：${count.n}`);

db.db.close();
