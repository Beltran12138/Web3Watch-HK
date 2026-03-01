const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { getNews, saveNews } = require('./db');
const { runAllScrapers } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;
const path = require('path');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get news
app.get('/api/news', (req, res) => {
  const source = req.query.source || 'All';
  const important = req.query.important || 0;
  const limit = (source === 'All' || important == 1) ? 500 : 100;
  const news = getNews(limit, source, important);
  res.json({
    success: true,
    count: news.length,
    lastUpdate: new Date().toISOString(),
    data: news
  });
});

// API: Manual trigger scrape
app.post('/api/refresh', async (req, res) => {
  try {
    const data = await runAllScrapers();
    res.json({
      success: true,
      count: data.length,
      data: data.slice(0, 10) // Only return top 10 for speed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scheduled task: Run scrapers every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] Running scheduled scrape...');
  await runAllScrapers();
});

// Catch-all route to serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`[SERVER] Alpha Radar Backend running on http://localhost:${PORT}`);
  
  // Initial scrape if database is empty
  const currentNews = getNews(1);
  if (currentNews.length === 0) {
    console.log('[INIT] Database empty, running initial scrape...');
    await runAllScrapers();
  }
});
