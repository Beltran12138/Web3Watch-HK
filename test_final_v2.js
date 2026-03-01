const { runAllScrapers } = require('./scraper');

async function test() {
    console.log('Final validation: Splitting Polymarket and verifying all sources...');
    try {
        await runAllScrapers();
        console.log('Final scrape successful.');
        process.exit(0);
    } catch (err) {
        console.error('Scrape failed:', err);
        process.exit(1);
    }
}

test();
