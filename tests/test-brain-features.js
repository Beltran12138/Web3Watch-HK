'use strict';

/**
 * tests/test-brain-features.js — 验证行业大脑 (v1.5.0) 新功能
 */

const { newsDAO, insightDAO } = require('../dao');
const { monitor } = require('../monitoring/monitor');
const { pushManager } = require('../push-channel');

async function runTests() {
  console.log('=== [Test] Starting Alpha-Radar Brain Features Test ===\n');

  // 1. 测试 DAO 与 Insights
  console.log('[Test 1] Testing InsightDAO...');
  const testInsight = {
    trend_key: 'RWA-TREND-2026',
    summary: 'RWA (Real World Assets) 领域在香港市场持续升温。',
    evidence_count: 5
  };
  await insightDAO.saveInsight(testInsight);
  const insights = await insightDAO.getRecent(1);
  if (insights.length > 0 && insights[0].trend_key === testInsight.trend_key) {
    console.log('✅ InsightDAO: Save & Read successful.');
  } else {
    console.error('❌ InsightDAO: Test failed.');
  }

  // 2. 模拟高能预警 (Intelligence Density Monitor)
  console.log('\n[Test 2] Testing IntelligenceDensityMonitor...');
  
  // 模拟 3 条来自不同来源的关于“稳定币”的新闻
  const mockNews = [
    { title: '香港拟下月发布稳定币监管框架', source: 'SFC', timestamp: Date.now(), url: 't1' },
    { title: '消息称某稳定币发行商正申请香港牌照', source: 'WuBlock', timestamp: Date.now() - 1000, url: 't2' },
    { title: '解读：香港稳定币新规对交易所的影响', source: 'BlockBeats', timestamp: Date.now() - 2000, url: 't3' }
  ];

  console.log('[Test 2] Injecting mock news into DB...');
  await newsDAO.save(mockNews);

  // 临时覆盖推送函数，拦截并验证
  const originalSend = pushManager.sendImportant;
  let alertSent = false;
  pushManager.sendImportant = async (title, content) => {
    console.log(`[Test 2] INTERCEPTED ALERT: ${title}`);
    alertSent = true;
    return true;
  };

  await monitor.checkDensity();

  if (alertSent) {
    console.log('✅ Monitor: Proactive alerting successful.');
  } else {
    console.error('❌ Monitor: No alert triggered (threshold or timing issues).');
  }

  // 恢复原始函数
  pushManager.sendImportant = originalSend;

  console.log('\n=== [Test] Brain Features Test Completed ===');
}

runTests().catch(err => {
  console.error('[Test Fatal]', err);
  process.exit(1);
});
