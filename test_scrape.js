const { runAllScrapers } = require('./scraper');

runAllScrapers().then(items => {
  const bySource = {};
  items.forEach(i => {
    bySource[i.source] = (bySource[i.source] || 0) + 1;
  });

  console.log('\n=== SCRAPE RESULTS BY SOURCE ===');
  const sorted = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([src, cnt]) => {
    console.log('  ' + src + ': ' + cnt + ' items');
  });

  // Identify expected sources that returned 0
  const expected = [
    'TechFlow','PRNewswire','BlockBeats',
    'TwitterAB','WuShuo','Phyrex','JustinSun','XieJiayin',
    'OSL','TechubNews','OKX','Exio','Matrixport','WuBlock',
    'HashKeyGroup','KuCoin','HashKeyExchange',
    'Binance','Bybit','Bitget','MEXC','HTX',
    'Poly-Breaking','Poly-China','Gate'
  ];
  const missing = expected.filter(s => !bySource[s]);
  if (missing.length > 0) {
    console.log('\n⚠️  Sources with 0 items (failed or empty):');
    missing.forEach(s => console.log('  - ' + s));
  }

  console.log('\nTOTAL: ' + items.length + ' items');
  process.exit(0);
}).catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
