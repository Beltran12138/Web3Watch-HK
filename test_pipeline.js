require('dotenv').config();
const { db } = require('./db');
const { processWithAI } = require('./ai');
const { sendToWeCom } = require('./wecom');

async function run() {
  const priorityKeywords = ['陈茂波', '证监会', 'SFC', 'HKMA', '金管局', '牌照', 'Listing', 'RWA', '稳定币', '合规', '香港', 'HashKey', 'OSL'];
  const recent = db.prepare('SELECT * FROM news ORDER BY timestamp DESC LIMIT 500').all();

  const candidates = recent.filter(item =>
    priorityKeywords.some(k => item.title.includes(k))
  );

  console.log('找到候选快讯:', candidates.length, '条');
  if (candidates.length === 0) { console.log('无候选条目'); return; }

  const item = { ...candidates[0] };
  console.log('选中快讯:', item.title.substring(0, 60));
  console.log('来源:', item.source, '| 时间:', new Date(item.timestamp).toLocaleString('zh-CN'));

  console.log('\n--- AI 处理中 ---');
  const aiResult = await processWithAI(item.title, item.content || '');
  if (!aiResult) { console.error('AI 处理失败'); return; }

  Object.assign(item, aiResult);
  console.log('业务类别:', item.business_category);
  console.log('竞品类别:', item.competitor_category);
  console.log('摘要:', item.detail);
  console.log('重要性:', item.is_important);

  console.log('\n--- 推送企微 ---');
  await sendToWeCom(item);
  console.log('✅ 全流程完成！');
}

run().catch(console.error);
