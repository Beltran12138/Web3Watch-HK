/**
 * cloudflare/scheduler — 替代 GitHub Actions 的 schedule 触发
 *
 * GitHub 对 schedule 触发严重降频：scrape_high 配每 15 分钟、scrape 配每 30 分钟，2026-10-16~30 实测都只有约 6 次/天
 * （中位间隔 4.1h），10-29 Binance 被盗因此晚了几个小时才被看到。
 * 这里用 Cron Trigger 每 10 分钟调一次 workflow_dispatch：scrape_high 每 10 分钟，scrape 每 30 分钟。
 * GH_TOKEN = fine-grained PAT，只授 Web3Watch-HK 一个仓库的 Actions: Read and write（wrangler secret put GH_TOKEN）。
 */

const REPO = 'Beltran12138/Web3Watch-HK';
const REF  = 'master';

async function dispatch(env, workflow) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'web3watch-scheduler',
    },
    body: JSON.stringify({ ref: REF }),
  });
  if (res.status !== 204) {
    console.error(`[scheduler] ${workflow} dispatch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  } else {
    console.log(`[scheduler] ${workflow} dispatched`);
  }
}

function workflowsFor(scheduledTime) {
  const wfs = ['scrape_high.yml'];
  if (new Date(scheduledTime).getUTCMinutes() % 30 === 0) wfs.push('scrape.yml');
  return wfs;
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.GH_TOKEN) {
      console.error('[scheduler] GH_TOKEN not set');
      return;
    }
    ctx.waitUntil(Promise.all(workflowsFor(event.scheduledTime).map(wf => dispatch(env, wf))));
  },
};
