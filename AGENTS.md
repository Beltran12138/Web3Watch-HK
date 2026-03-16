# Alpha-Radar AI Agent Instructions

## Project Overview

Alpha-Radar is a Web3/Crypto industry intelligence aggregation system that:
- Scrapes 20+ data sources (exchanges, media, KOLs, prediction markets)
- Uses DeepSeek AI for intelligent classification and summarization
- Supports multi-channel push notifications (WeCom, DingTalk, Slack, Telegram, Email)
- Generates daily/weekly reports automatically

## Architecture

```
alpha-radar/
├── scrapers/           # Data collection layer
│   ├── index.js       # Main orchestrator
│   ├── browser.js     # Shared browser pool
│   └── sources/       # Individual scrapers
├── ai*.js             # AI processing (multiple providers)
├── db.js              # SQLite + Supabase storage
├── push-channel.js    # Multi-channel notification
├── server.js          # Express API server
└── public/            # Frontend (static HTML)
```

## Key Dependencies

- `better-sqlite3` - Local database
- `puppeteer` - Browser automation
- `axios` - HTTP client
- `deepseek` / `openai` - AI providers

## Common Tasks

### Run Scrapers
```bash
npm run scrape        # All sources
npm run scrape:high   # High-frequency sources (5min)
npm run scrape:low    # Low-frequency sources (30min)
```

### Generate Reports
```bash
npm run daily-report:dry   # Test daily report
npm run weekly-report:dry  # Test weekly report
```

### Test Push Notifications
```bash
npm run test-push
```

### Data Lifecycle
```bash
npm run cleanup        # Clean old data
```

## Environment Variables

See `.env.example` for configuration. Key variables:
- `DEEPSEEK_API_KEY` - Primary AI provider
- `WECOM_WEBHOOK_URL` - WeCom notification
- `USE_SUPABASE` - Enable cloud sync
- `API_SECRET` - Protect API endpoints

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news` | GET | List news with filters |
| `/api/stats` | GET | Get statistics |
| `/api/health` | GET | Health check |
| `/api/export` | GET | Export data (CSV/JSON) |
| `/api/push/test` | POST | Test push notification |

## Development

```bash
npm install
npm run dev    # Hot reload
npm start     # Production
```

## Adding New Data Sources

1. Create scraper in `scrapers/sources/`
2. Register in `scrapers/index.js`
3. Add config in `config.js`

## Adding New Push Channels

1. Implement in `push-channel.js`
2. Add env config in `.env.example`
3. Test with `npm run test-push`
