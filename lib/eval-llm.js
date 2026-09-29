'use strict';
/**
 * lib/eval-llm.js — 评测用的模型调用：固定一个模型（不走 ai-provider 的多家回退，评测结果才可比），
 * 结果按「模型 + 提示词 + 输入 + 第几次」的哈希缓存在本地。同样的输入再跑不会重复花钱，
 * 只有改过的提示词或新样本才产生新调用。
 *
 * 环境变量：EVAL_LLM_BASE_URL（默认 DeepSeek）、EVAL_LLM_MODEL（默认 deepseek-chat）、
 *           EVAL_LLM_API_KEY（默认取 DEEPSEEK_API_KEY）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = (process.env.EVAL_LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.EVAL_LLM_MODEL || 'deepseek-chat';
const KEY = process.env.EVAL_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function createClient(cacheDir, { model = MODEL } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const usage = { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0 };

  /** @returns {Promise<object>} 解析后的 JSON */
  async function chatJson({ system, user, attempt = 1, temperature = 0.2, maxTokens = 512 }) {
    const key = sha(JSON.stringify([model, system, user, attempt, temperature]));
    const file = path.join(cacheDir, `${key}.json`);
    if (fs.existsSync(file)) { usage.cached++; return JSON.parse(fs.readFileSync(file, 'utf8')).data; }
    if (!KEY) throw new Error('缺少 EVAL_LLM_API_KEY / DEEPSEEK_API_KEY');
    let lastError;
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({
            model, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        const body = await res.json();
        const text = body.choices?.[0]?.message?.content || '';
        const data = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
        usage.calls++;
        usage.promptTokens += body.usage?.prompt_tokens || 0;
        usage.completionTokens += body.usage?.completion_tokens || 0;
        // 先存再用：进程中断后重跑直接复用
        fs.writeFileSync(file, JSON.stringify({ model, at: new Date().toISOString(), data, usage: body.usage || null }));
        return data;
      } catch (e) {
        lastError = e;
        await new Promise(r => setTimeout(r, 2000 * (tryNo + 1)));
      }
    }
    throw lastError;
  }

  return { chatJson, usage, model };
}

/** 有限并发地跑一批异步任务 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

module.exports = { createClient, mapLimit, MODEL };
