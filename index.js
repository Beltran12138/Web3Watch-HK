const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(Date.now() / 1000),
    db: {
      total: 1444,
      important: 394,
      sources: [
        { source: 'BlockBeats', n: 244 },
        { source: 'HTX', n: 104 },
        { source: 'Matrixport', n: 90 },
      ],
    },
    version: '1.2.0',
  });
});

app.get('/api/news', async (req, res) => {
  res.json({
    success: true,
    count: 0,
    page: 1,
    lastUpdate: new Date().toISOString(),
    data: [],
  });
});

app.get('/api/stats', async (req, res) => {
  res.json({
    success: true,
    data: {
      total: 1444,
      important: 394,
      categories: [],
      sources: [],
    },
  });
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
