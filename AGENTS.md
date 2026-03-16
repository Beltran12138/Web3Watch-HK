# Alpha Radar - Agent Configuration

This file contains instructions for AI coding assistants working on this project.

## Project Overview

Alpha Radar is a Web3/Crypto industry intelligence aggregation system that:
- Scrapes 20+ data sources (exchanges, media, KOLs, prediction markets)
- Uses AI (DeepSeek) for classification, summarization, and scoring
- Delivers multi-channel notifications (WeCom, DingTalk, Slack, Telegram, Email)
- Generates daily/weekly reports automatically

## Tech Stack

- **Runtime**: Node.js 20.x
- **Framework**: Express.js 5.x
- **Database**: SQLite (better-sqlite3) + Supabase (optional)
- **Scraping**: Puppeteer, Axios, Cheerio
- **AI**: DeepSeek V3 + fallback providers (OpenRouter, OpenAI, Anthropic, Google)
- **Scheduling**: node-cron
- **Security**: Helmet, express-rate-limit, CORS

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Start production server
npm start

# Run tests
npm test
npm run test:unit

# Lint and format
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Build frontend
npm run build

# Manual operations
npm run scrape              # Run all scrapers
npm run scrape:high         # Run high-frequency scrapers only
npm run scrape:low          # Run low-frequency scrapers only
npm run daily-report        # Generate daily report
npm run weekly-report       # Generate weekly report
npm run daily-report:dry    # Test daily report (no push)
npm run weekly-report:dry   # Test weekly report (no push)
npm run cleanup             # Run data lifecycle cleanup
npm run test-push           # Test push channels
```

## Code Style Guidelines

### JavaScript

- Use CommonJS (`require`/`module.exports`) - not ES modules
- Use single quotes for strings
- Use 2 spaces for indentation
- Max line length: 120 characters
- Always use semicolons
- Use `const` by default, `let` when necessary, never `var`
- Use strict equality (`===`) except for null checks

### Naming Conventions

- **Files**: kebab-case.js (e.g., `data-lifecycle.js`)
- **Functions**: camelCase (e.g., `runAllScrapers`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Classes**: PascalCase (e.g., `CircuitBreaker`)

### Error Handling

Always use try-catch with structured logging:

```javascript
const logger = require('./lib/logger');

try {
  const result = await someOperation();
  logger.info({ result }, 'Operation completed');
} catch (err) {
  logger.error({ err }, 'Operation failed');
  throw err; // or handle gracefully
}
```

### Logging

Use the structured logger from `lib/logger.js`:

```javascript
const logger = require('./lib/logger');

// Good - structured logging
logger.info({ source: 'Binance', count: 15 }, 'Scrape completed');
logger.error({ err }, 'Failed to process item');

// Avoid - console logging
console.log('Scrape completed'); // Don't do this
```

## Project Structure

```
alpha-radar/
├── lib/                    # Shared utilities
│   ├── logger.js          # Structured logging (pino)
│   ├── circuit-breaker.js # Circuit breaker pattern
│   └── scraper-registry.js # Scraper plugin registry
├── routes/                 # Express route modules
│   ├── news.js            # News APIs
│   ├── admin.js           # Admin APIs (API key protected)
│   ├── monitoring.js      # Health/status APIs
│   └── sync.js            # Cloud sync APIs
├── scrapers/              # Data scraping modules
│   ├── index.js           # Main scheduler
│   ├── browser.js         # Shared browser pool
│   ├── utils.js           # Common utilities
│   └── sources/           # Individual scrapers
├── tests/                 # Test files
│   └── unit/              # Unit tests
├── config.js              # Global configuration
├── server.js              # Express server entry
└── package.json
```

## Security Requirements

1. **API Key Authentication**: Write operations require `X-API-Key` header
2. **No URL API Keys**: Never pass API keys in URL parameters
3. **CORS**: Configure `CORS_ORIGIN` in production
4. **CSP**: Content Security Policy is enabled (see security.js)
5. **Rate Limiting**: Applied to all endpoints (1000 req/15min read, 10 req/min write)

## Testing

- Tests use Jest
- Test files: `*.test.js` or in `tests/` directory
- Mock external APIs in tests
- Run tests before committing: `npm test`

## Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Required
DEEPSEEK_API_KEY=sk-xxx
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/...

# Security
API_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com

# Optional - AI fallback providers
OPENROUTER_API_KEY=sk-or-v1-xxx
OPENAI_API_KEY=sk-proj-xxx

# Optional - Additional push channels
DINGTALK_WEBHOOK_URL=...
SLACK_WEBHOOK_URL=...
TELEGRAM_BOT_TOKEN=...
```

## Database Migrations

SQLite schema is auto-created on first run. For manual migrations:

```bash
# Check current schema
sqlite3 alpha_radar.db ".schema"

# Run cleanup/archival
npm run cleanup
```

## Deployment

### Vercel (Recommended)
1. Fork repository
2. Import to Vercel
3. Add environment variables
4. Deploy

### Docker
```bash
docker-compose up -d
```

### Local
```bash
npm install
npm start
```

## Common Tasks

### Adding a New Data Source

1. Create scraper function in `scrapers/sources/` (apis.js or puppeteer.js)
2. Register in `scrapers/index.js` or use `scraper-registry.js`
3. Add source name to `VALID_SOURCES` in `routes/news.js`
4. Add config to `config.js` if needed
5. Add tests

### Adding a New API Endpoint

1. Add route to appropriate file in `routes/`
2. Use `apiKeyGuard` middleware for write operations
3. Use structured logging
4. Add error handling with `next(err)`
5. Update Swagger docs if applicable

### Modifying AI Prompts

1. Edit `ai.js` or `ai-enhanced.js`
2. Update `BUSINESS_CATEGORIES` or `COMPETITOR_CATEGORIES` in `config.js` if needed
3. Test with dry-run mode: `npm run daily-report:dry`

## Troubleshooting

### Database locked errors
- SQLite doesn't handle high concurrency well
- Consider using Supabase for multi-instance deployments

### Puppeteer memory issues
- Browser pool is shared (see `scrapers/browser.js`)
- Automatic cleanup on process exit

### AI API failures
- System has 3-tier fallback (DeepSeek → OpenRouter → Rule Engine)
- Check `/api/ai-status` for provider status

## References

- [Express.js Docs](https://expressjs.com/)
- [Puppeteer Docs](https://pptr.dev/)
- [better-sqlite3 Docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Pino Logger Docs](https://getpino.io/)
