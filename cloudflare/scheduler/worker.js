/**
 * cloudflare/scheduler — 替代 GitHub Actions 的 schedule 触发
 *
 * GitHub 对 schedule 触发严重降频：scrape_high 配每 15 分钟、scrape 配每 30 分钟，2026-10-16~30 实测都只有约 6 次/天
 * （中位间隔 4.1h），10-29 Binance 被盗因此晚了几个小时才被看到。
 * 这里用 Cron Trigger 每 10 分钟调一次 workflow_dispatch：scrape_high 每 10 分钟，scrape 每 30 分钟，
 * daily_report 每天 UTC 10:00（北京 18:00）一次。
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
  const t = new Date(scheduledTime);
  const wfs = ['scrape_high.yml'];
  if (t.getUTCMinutes() % 30 === 0) wfs.push('scrape.yml');
  // 日报同病：daily_report.yml 的 cron 是 '0 10 * * *'（北京 18:00），2026-11-03~14 实测 12/12 次
  // 都被拖到 16:02–20:22 UTC，等于每天在北京时间 0:00–4:20 才推到企微。这里准点敲一次。
  // 重复触发无害：daily_report.yml 自己的 check 任务看到今天已有成功运行就会跳过。
  if (t.getUTCHours() === 10 && t.getUTCMinutes() === 0) wfs.push('daily_report.yml');
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
