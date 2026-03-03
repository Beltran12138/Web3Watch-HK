const axios = require('axios');
require('dotenv').config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 智能分类与摘要（DeepSeek V3）
 */
async function processWithAI(title, content = '') {
  if (!DEEPSEEK_API_KEY) {
    console.warn('[AI] No DeepSeek API Key found, skipping AI processing.');
    return null;
  }

  const prompt = `你是一个加密货币行业资深分析师。请对以下快讯进行分类和提炼。

快讯内容：
标题: ${title}
内容: ${content}

请输出一个 JSON 对象，包含以下字段，不要包含任何 Markdown 格式：
1. business_category: 必须从以下选项中选择一个：[合规, 监管, 政策, RWA, 稳定币/平台币, 交易/量化, 钱包/支付, toB/机构, 学院/社交/内容, 大客户/VIP, 法币兑换, 理财, 拉新/社媒/社群/pr, 投融资, 其他]
2. competitor_category: 必须从以下选项中选择一个：[香港合规所, 离岸所, 政策, 香港其他, 传统金融, 其他]
3. detail: 请用一句话（100字以内）总结该快讯的核心详情，文风要专业、干练，类似于周报中的 Bullet point。
4. is_important: 如果该消息对公司高层具有重大战略参考价值，返回 1，否则返回 0。

示例格式：
{"business_category":"RWA","competitor_category":"香港合规所","detail":"HashKey Group 推出 RWA 一站式发行解决方案，面向发行方与中介机构赋能。","is_important":1}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.post(API_URL, {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }, {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) return null;

      return JSON.parse(text);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < 3) {
        const wait = attempt * 8000;
        console.warn(`[AI] Rate limited, retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        console.error('[AI Error]:', err.response?.data?.error?.message || err.message);
        return null;
      }
    }
  }
}

module.exports = { processWithAI };
