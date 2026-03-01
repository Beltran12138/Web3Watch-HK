// 用 Puppeteer 拦截 Bitget 和 MEXC 实际发出的 API 请求
const puppeteer = require('puppeteer');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function interceptRequests(siteName, url) {
  console.log(`\n=== Intercepting ${siteName}: ${url} ===`);
  let browser;
  const captured = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Capture all XHR/fetch JSON requests
    page.on('response', async (res) => {
      const u = res.url();
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json') && res.status() === 200) {
        // Filter to likely announcement/news/notice endpoints
        if (u.includes('notice') || u.includes('announce') || u.includes('article') ||
            u.includes('news') || u.includes('bulletin') || u.includes('support')) {
          try {
            const body = await res.json();
            const count = Array.isArray(body?.data) ? body.data.length :
                          Array.isArray(body?.data?.list) ? body.data.list.length : '?';
            captured.push({ url: u, count });
          } catch (_) {
            captured.push({ url: u, count: 'parse-err' });
          }
        }
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));

    if (captured.length === 0) {
      console.log('No relevant JSON API calls captured');
      // Show ALL json calls instead
      console.log('Checking DOM for any articles...');
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(h => h.includes('article') || h.includes('announce') || h.includes('notice') || h.includes('support'))
          .slice(0, 15);
      });
      links.forEach(l => console.log(' DOM link:', l));
    } else {
      captured.forEach(c => console.log(` API: ${c.url}  (items: ${c.count})`));
    }
  } catch (err) {
    console.error(`${siteName} error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

(async () => {
  await interceptRequests('Bitget', 'https://www.bitget.com/zh-CN/support/announcements');
  await interceptRequests('MEXC', 'https://www.mexc.com/zh-MX/announcements/all');
})();
