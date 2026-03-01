const puppeteer = require('puppeteer');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(UA);

  const apis = [];
  page.on('response', async (res) => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && res.status() === 200) {
      if (u.includes('article') || u.includes('notice') || u.includes('announce') || u.includes('bulletin')) {
        try {
          const body = await res.json();
          const count = Array.isArray(body?.data) ? body.data.length :
                        Array.isArray(body?.data?.list) ? body.data.list.length :
                        Array.isArray(body?.data?.items) ? body.data.items.length : '?';
          apis.push({ u, count, sample: JSON.stringify(body).slice(0, 200) });
        } catch (_) {
          apis.push({ u, count: 'err' });
        }
      }
    }
  });

  await page.goto('https://www.bitget.com/zh-CN/support/announcement-center', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 10000));

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ href: a.href, text: (a.innerText || '').trim().slice(0, 80) }))
      .filter(item => item.href.includes('/support/') && item.href.length > 60 && !item.href.includes('register'))
      .slice(0, 20);
  });

  console.log('=== Article Links ===');
  links.forEach(l => console.log(' ', l.href, '|', l.text));
  console.log('\n=== Intercepted API calls ===');
  apis.forEach(a => console.log(' ', a.u, '(count:', a.count + ')'));

  await browser.close();
})().catch(e => console.error('Fatal:', e.message));
