const { processWithAI } = require('./ai');

async function test() {
  console.log('--- Testing Gemini AI Classification ---');
  
  const testTitle = '陈茂波：香港稳定币发行人首批牌照3月即将落地，正推进数字资产交易及托管服务';
  console.log('Input Title:', testTitle);
  
  try {
    const result = await processWithAI(testTitle, '');
    if (result) {
      console.log('\n--- AI Results ---');
      console.log('Business Category:', result.business_category);
      console.log('Competitor Category:', result.competitor_category);
      console.log('Summary (Bullet Point):', result.detail);
      console.log('Is Important:', result.is_important);
    } else {
      console.log('\nAI Processing returned null.');
    }
  } catch (err) {
    console.error('Test Error:', err.message);
  }
}

test();
