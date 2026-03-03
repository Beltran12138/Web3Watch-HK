const { db } = require('./db');
const fs = require('fs');
const path = require('path');

/**
 * 生成周报 Markdown
 */
function generateWeeklyReport() {
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  // 1. 获取本周数据
  const rows = db.prepare(`
    SELECT * FROM news 
    WHERE timestamp > ? 
    ORDER BY business_category, timestamp DESC
  `).all(oneWeekAgo);

  if (rows.length === 0) {
    console.log('No news found for this week.');
    return;
  }

  // 2. 按业务类别分组
  const reportData = {};
  rows.forEach(row => {
    const cat = row.business_category || '其他';
    if (!reportData[cat]) reportData[cat] = [];
    reportData[cat].push(row);
  });

  // 3. 构建 Markdown 字符串
  const dateStr = new Date().toISOString().split('T')[0];
  let md = `# ${dateStr} 行业动态周报

`;

  const categoryOrder = ['合规', '监管', '政策', 'RWA', '稳定币/平台币', '交易/量化', '钱包/支付', 'toB/机构', '学院/社交/内容', '大客户/VIP', '法币兑换', '理财', '拉新/社媒/社群/pr', '投融资', '其他'];
  
  // 按照预设顺序或默认顺序输出
  const categories = Object.keys(reportData).sort((a, b) => {
    return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
  });

  categories.forEach(cat => {
    const items = reportData[cat];
    md += `## ${cat}（${items.length} 条）\n\n`;
    items.forEach((item, index) => {
      const compTag = item.competitor_category ? ` \`${item.competitor_category}\`` : '';
      md += `${index + 1}. **${item.title}**${compTag}\n`;
      if (item.detail) {
        md += `   > ${item.detail}\n`;
      }
      md += `   [原文链接](${item.url})\n\n`;
    });
  });

  md += `## 个人思考
`;
  md += `1. [在此输入本周的洞察...]
`;

  // 4. 保存到文件
  const filePath = path.join(__dirname, `Weekly_Report_${dateStr}.md`);
  fs.writeFileSync(filePath, md);
  console.log(`[Success] Weekly report generated: ${filePath}`);
}

if (require.main === module) {
  generateWeeklyReport();
}

module.exports = { generateWeeklyReport };
