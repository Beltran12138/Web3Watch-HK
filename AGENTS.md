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
- **Runtime model**: GitHub Actions jobs + Vercel serverless functions (`api/`). The old Express server (`server.js`, `routes/`) was removed on 2026-10-08 — it was never deployed.
- **Database**: SQLite (better-sqlite3) + Supabase (optional)
- **Scraping**: Puppeteer, Axios, Cheerio
- **AI**: DeepSeek V3 + fallback providers (OpenRouter, OpenAI, Anthropic, Google)
- **Scheduling**: node-cron

## Development Commands

```bash
# Install dependencies
npm install

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
├── api/                    # Vercel serverless functions (read-only, Supabase)
├── scrapers/              # Data scraping modules
│   ├── index.js           # Main scheduler
│   ├── browser.js         # Shared browser pool
│   ├── utils.js           # Common utilities
│   └── sources/           # Individual scrapers
├── tests/                 # Test files
│   └── unit/              # Unit tests
├── config.js              # Global configuration
└── package.json
```

## Security Requirements

1. **No write endpoints**: `api/*.js` on Vercel are read-only GETs. Writes to Supabase happen only from GitHub Actions.
2. **No URL API Keys**: Never pass API keys in URL parameters
3. **Never commit secrets**: everything goes through GitHub / Vercel secrets

## Testing

- Tests use Jest
- Test files: `*.test.js` or in `tests/` directory
- Mock external APIs in tests
- Run tests before committing: `npm run test:unit` (CI runs it on every push / PR: `.github/workflows/test.yml`)

## Weekly report — do not touch

The weekly email that the owner triggers by hand every week must keep working unchanged:
`.github/workflows/send_weekly_email.yml`, `run_send_weekly_email.js`, `email-report.js`, `weekly/` (including the
committed images), `assets/logo.jpg`. Keep `dotenv` and `nodemailer` in package.json / package-lock.json, and the
SMTP_* / WEEKLY_EMAIL_* secrets. `run_send_weekly_email.js` loads only `email-report.js`.

## Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Required
DEEPSEEK_API_KEY=sk-xxx
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/...

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

### Local
```bash
npm install
npm run scrape:high        # one scrape round
npm run daily-report:dry   # build a report without pushing
```

## Common Tasks

### Adding a New Data Source

1. Create scraper function in `scrapers/sources/` (apis.js or puppeteer.js)
2. Register in `SCRAPERS_MAP` in `scrapers/index.js`
3. Add config to `config.js` if needed (note: config.js is loaded by the weekly report — additive changes only)
4. Add tests

### Adding a New API Endpoint

1. Add a read-only function in `api/` (Vercel serverless; reads Supabase via REST)
2. Use structured logging and return `{ success, ... }`

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
