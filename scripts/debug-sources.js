'use strict';
/**
 * scripts/debug-sources.js — 在 CI runner 上诊断数据源（只读：不写库、不推送）
 *
 * 用法：node scripts/debug-sources.js
 *   Gate：打开公告页，打印公告链接 + 页面发出的公告类 JSON 请求
 *   HTX ：分别测直连与 Tor（socks5://127.0.0.1:9050）
 */

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

async function debugGate() {
  console.log('\n=== Gate ===');
  const puppeteer = require('puppeteer-extra');
  puppeteer.use(require('puppeteer-extra-plugin-stealth')());
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const json = [];
    page.on('response', async res => {
      const url = res.url();
      if (!/announce|article|notice/i.test(url)) return;
      if (!/json/i.test(res.headers()['content-type'] || '')) return;
      let body = '';
      try { body = (await res.text()).slice(0, 300); } catch (_) {}
      json.push({ status: res.status(), url, body });
    });
    for (const url of ['https://www.gate.com/zh/announcements', 'https://www.gate.com/announcements']) {
      const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => ({ status: () => e.message }));
      await new Promise(r => setTimeout(r, 8000));
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
        .map(a => ({ href: a.href, text: (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) }))
        .filter(l => /announcements\/(article|detail)|\/article\//.test(l.href) && l.text.length > 8));
      console.log(`[Gate] ${url} status=${resp.status()} title="${await page.title()}" articleLinks=${links.length}`);
      links.slice(0, 15).forEach(l => console.log(`   ${l.text} | ${l.href}`));
    }
    console.log(`[Gate] JSON responses (${json.length}):`);
    json.slice(0, 20).forEach(j => console.log(`   ${j.status} ${j.url}\n      ${j.body.replace(/\s+/g, ' ')}`));
  } finally {
    await browser.close();
  }
}

async function debugHtx() {
  console.log('\n=== HTX ===');
  const url = 'https://www.htx.com/-/x/support/public/getList/v2?language=zh-cn&page=1&limit=5&oneLevelId=360000031902&twoLevelId=360000039481';
  const variants = [
    ['direct', {}],
    ['tor', { httpsAgent: new SocksProxyAgent('socks5://127.0.0.1:9050') }],
  ];
  for (const [name, opt] of variants) {
    try {
      const { status, data } = await axios.get(url, { ...opt, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const list = data?.data?.list || [];
      console.log(`[HTX ${name}] status=${status} items=${list.length} first="${list[0]?.title || ''}"`);
    } catch (err) {
      console.log(`[HTX ${name}] FAIL ${err.response?.status || ''} ${err.message}`);
    }
  }
}

(async () => {
  await debugHtx();
  await debugGate().catch(err => console.log('[Gate] FAIL', err.message));
  process.exit(0);
})();
