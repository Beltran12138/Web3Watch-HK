'use strict';
/**
 * telegram-intel-agent.js — Telegram 行研情报 Agent（Hermes-compatible）
 *
 * 实现"会学习的行研 Agent"架构的 Telegram 接入层：
 *   实时数据（Web3Watch） → 行研知识库（Obsidian Wiki） → 智能问答
 *
 * 功能：
 *   - 用户在 Telegram 提问 → 查 Supabase + 读取 Wiki → AI 综合回答
 *   - 支持自然语言查询（竞品/监管/RWA/趋势/建议）
 *   - Skill 标准：兼容 agentskills.io / Hermes Agent 格式
 *
 * 配置（.env）：
 *   TELEGRAM_BOT_TOKEN=xxx
 *   TELEGRAM_INTEL_CHAT_ID=xxx   # 允许查询的 chat_id（可用逗号分隔多个）
 *   SUPABASE_URL=xxx
 *   SUPABASE_ANON_KEY=xxx
 *   DEEPSEEK_API_KEY=xxx
 *
 * 启动：
 *   node telegram-intel-agent.js
 *   # 或配合 pm2: pm2 start telegram-intel-agent.js --name intel-agent
 */

require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const WIKI_DIR    = path.join(__dirname, 'wiki');
const TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_IDS = (process.env.TELEGRAM_INTEL_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);

if (!TOKEN) {
  console.error('[IntelAgent] TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;

// ── Wiki 读取工具 ──────────────────────────────────────────────────────────────

function readWiki(filename) {
  const p = path.join(WIKI_DIR, filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function allWikiContent() {
  const files = [
    '核心切入机会.md',
    '竞品-HashKey.md',
    '竞品-OSL.md',
    '监管-香港SFC.md',
    '业务方向-RWA.md',
    '市场趋势.md',
  ];
  return files
    .map(f => {
      const content = readWiki(f);
      if (!content) return '';
      return `### ${f.replace('.md', '')}\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// ── Supabase 查询 ─────────────────────────────────────────────────────────────

async function querySupabase(sql) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return [];
  try {
    const { data } = await axios.post(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`,
      { query: sql },
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchRecentNews(daysBack = 7, minScore = 65) {
  // 先尝试 Supabase REST API（不依赖 execute_sql RPC）
  try {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();
    const { data } = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/news_items`,
      {
        params: {
          select: 'title,detail,source,alpha_score,business_category,bitv_action,created_at',
          alpha_score: `gte.${minScore}`,
          created_at: `gte.${since}`,
          order: 'alpha_score.desc',
          limit: 30,
        },
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        timeout: 8000,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── 意图检测 ──────────────────────────────────────────────────────────────────

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/hashkey|哈希键/.test(t))          return { type: 'competitor', target: 'HashKey' };
  if (/osl/.test(t))                      return { type: 'competitor', target: 'OSL' };
  if (/sfc|证监会|监管|牌照|合规|vatp/.test(t)) return { type: 'regulatory' };
  if (/rwa|代币化|tokeniz|黄金|gold/.test(t)) return { type: 'rwa' };
  if (/稳定币|stablecoin|rlusd|usdgo/.test(t)) return { type: 'stablecoin' };
  if (/ai.*(agent|交易)|skills hub|gate for ai/.test(t)) return { type: 'ai_trend' };
  if (/建议|策略|优先级|我们该|我司/.test(t)) return { type: 'strategy' };
  if (/日报|今日|今天/.test(t))           return { type: 'daily' };
  if (/趋势|市场/.test(t))               return { type: 'trend' };
  return { type: 'general' };
}

// ── AI 回答生成 ───────────────────────────────────────────────────────────────

async function generateAnswer(userQuery, newsItems, wikiContent) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return formatBasicAnswer(userQuery, newsItems);
  }

  const newsText = newsItems.slice(0, 15).map((item, i) =>
    `${i + 1}. [${item.source}] ${item.title}（alpha=${item.alpha_score}）\n   ${item.detail || ''}${item.bitv_action ? '\n   💡 ' + item.bitv_action : ''}`,
  ).join('\n\n');

  const prompt = `你是 BitV 产品团队的香港 Web3 市场情报助手。

**用户问题：** ${userQuery}

**最近相关新闻（来自 Web3Watch-HK 实时库）：**
${newsText || '（暂无相关新闻）'}

**行研知识库战略背景：**
${wikiContent.slice(0, 2000)}

请按以下格式回答（中文，简洁，产品团队可直接使用）：
1. **事件速览**（2-3条最相关新闻要点）
2. **战略背景**（结合Wiki，1段关键判断）
3. **BitV 建议**（1-2个可执行的产品/业务建议）

总字数控制在 300 字以内。`;

  try {
    const { data } = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    return data.choices?.[0]?.message?.content || formatBasicAnswer(userQuery, newsItems);
  } catch (err) {
    console.error('[IntelAgent] AI error:', err.message);
    return formatBasicAnswer(userQuery, newsItems);
  }
}

function formatBasicAnswer(userQuery, newsItems) {
  if (newsItems.length === 0) return `📭 暂无关于"${userQuery}"的相关情报（最近7天）。`;
  const lines = newsItems.slice(0, 5).map(item => {
    const score = item.alpha_score ? ` \`${item.alpha_score}\`` : '';
    return `• [${item.source}]${score} ${item.title}\n  ${item.detail || ''}`;
  });
  return `📡 **${userQuery}** 相关情报：\n\n${lines.join('\n\n')}`;
}

// ── Telegram 发送 ─────────────────────────────────────────────────────────────

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // 重试不带 Markdown
    try {
      await axios.post(`${BASE_URL}/sendMessage`, {
        chat_id: chatId,
        text: text.replace(/[*_`\[\]]/g, '').slice(0, 4096),
      });
    } catch (e2) {
      console.error('[IntelAgent] Send failed:', e2.message);
    }
  }
}

// ── 消息处理器 ────────────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();

  // 权限检查
  if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(String(chatId))) {
    console.log(`[IntelAgent] Blocked chat_id: ${chatId}`);
    return;
  }

  if (!text || text.startsWith('/start')) {
    await sendMessage(chatId, `👋 BitV 行研情报助手已就绪！\n\n可以问我：\n• 竞品动态（HashKey/OSL）\n• 监管进展（SFC/VATP）\n• RWA 项目情况\n• 稳定币格局\n• 市场趋势\n• BitV 产品建议\n\n直接发问即可。`);
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId, `📚 **支持的查询类型**\n\n🏛️ 竞品：HashKey、OSL 最新动态\n📜 监管：SFC、VATP 牌照进展\n🏦 RWA：代币化项目落地情况\n💱 稳定币：RLUSD、USDGO 等格局\n🤖 AI趋势：AI Agent 交易所化浪潮\n💡 策略：BitV 当前优先级建议\n📋 日报：今日高分情报汇总`);
    return;
  }

  await sendMessage(chatId, '⏳ 查询中…');

  const intent = detectIntent(text);
  let newsItems = [];
  let wikiFiles = ['核心切入机会.md'];

  switch (intent.type) {
    case 'competitor':
      newsItems = await fetchRecentNews(7, 60);
      newsItems = newsItems.filter(n =>
        intent.target === 'HashKey'
          ? /hashkey/i.test(n.source + n.title)
          : /osl/i.test(n.source + n.title),
      );
      wikiFiles.push(intent.target === 'HashKey' ? '竞品-HashKey.md' : '竞品-OSL.md');
      break;
    case 'regulatory':
      newsItems = await fetchRecentNews(14, 60);
      newsItems = newsItems.filter(n =>
        /合规|监管|牌照|sfc|vatp/i.test((n.business_category || '') + n.title),
      );
      wikiFiles.push('监管-香港SFC.md');
      break;
    case 'rwa':
    case 'stablecoin':
      newsItems = await fetchRecentNews(14, 65);
      newsItems = newsItems.filter(n =>
        /rwa|代币化|黄金|稳定币|stablecoin/i.test((n.business_category || '') + n.title),
      );
      wikiFiles.push('业务方向-RWA.md', '监管-香港SFC.md');
      break;
    case 'ai_trend':
      newsItems = await fetchRecentNews(14, 70);
      newsItems = newsItems.filter(n => /ai.*(agent|交易)|skills hub/i.test(n.title));
      wikiFiles.push('市场趋势.md');
      break;
    case 'strategy':
      newsItems = await fetchRecentNews(7, 80);
      wikiFiles = ['核心切入机会.md', '市场趋势.md', '业务方向-RWA.md'];
      break;
    case 'daily':
      newsItems = await fetchRecentNews(1, 65);
      wikiFiles = ['核心切入机会.md'];
      break;
    default:
      newsItems = await fetchRecentNews(7, 70);
      wikiFiles = ['核心切入机会.md', '市场趋势.md'];
  }

  const wikiContent = wikiFiles
    .map(f => { const c = readWiki(f); return c ? `## ${f.replace('.md', '')}\n${c}` : ''; })
    .filter(Boolean)
    .join('\n\n');

  const answer = await generateAnswer(text, newsItems, wikiContent);
  await sendMessage(chatId, answer);
}

// ── 轮询主循环 ────────────────────────────────────────────────────────────────

let lastUpdateId = 0;

async function poll() {
  try {
    const { data } = await axios.get(`${BASE_URL}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 25, allowed_updates: ['message'] },
      timeout: 30000,
    });
    const updates = data.result || [];
    for (const update of updates) {
      lastUpdateId = update.update_id;
      if (update.message) {
        handleMessage(update.message).catch(err =>
          console.error('[IntelAgent] Handler error:', err.message),
        );
      }
    }
  } catch (err) {
    if (!err.message.includes('timeout')) {
      console.error('[IntelAgent] Poll error:', err.message);
    }
  }
  setTimeout(poll, 1000);
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

console.log('[IntelAgent] Starting BitV HK Market Intel Agent…');
console.log(`[IntelAgent] Wiki dir: ${WIKI_DIR}`);
console.log(`[IntelAgent] Allowed chats: ${ALLOWED_IDS.length > 0 ? ALLOWED_IDS.join(', ') : '(all)'}`);
poll();
