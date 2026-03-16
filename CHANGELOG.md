# Alpha Radar Changelog

## v2.1.0 (2026-03-17)

### Security Enhancements

- **CSP Policy Enabled** (`security.js`)
  - Enabled Content Security Policy
  - Configured allowed CDNs (unpkg.com, jsdelivr.net, statics.moonshot.cn)
  - Restricted script, style, image, and font loading sources

- **API Key Transmission Fix** (`server.js`)
  - Removed `?apiKey=xxx` URL parameter support
  - API Key now only accepted via `X-API-Key` header
  - Prevents key leakage in browser history and server logs

- **Unified CORS Configuration** (`security.js`)
  - Consolidated CORS configuration in security.js
  - Production environment requires `CORS_ORIGIN` for cross-origin requests

- **Global Error Handler** (`server.js`)
  - Added Express global error handling middleware
  - Hidden detailed errors in production
  - Preserved stack traces in development

### Performance Optimizations

- **Separated Rate Limiting** (`security.js`)
  - Read operations: 1000 req/15min (GET/HEAD requests)
  - Write operations: 10 req/min (POST/PUT/DELETE)
  - Protected critical endpoints: refresh, daily-report, weekly-report, cleanup, sync/save, push-test

- **Request Body Size Limit** (`server.js`)
  - JSON body limited to 10MB

### Engineering Improvements

- **Unified Version Number**
  - package.json: 2.0.0 → 2.1.0
  - README.md: 1.4.0 → 2.1.0

- **Code Quality Toolchain**
  - ESLint configuration (bug detection, code style)
  - Prettier configuration (unified formatting)
  - CI workflow (automatic tests and lint on PR)

- **Structured Logging** (`lib/logger.js`)
  - Pino-based structured logging system
  - Log levels: debug/info/warn/error
  - JSON format for log analysis systems

- **Modular Routing** (`routes/`)
  - Split server.js into independent route modules
  - routes/news.js - News API
  - routes/admin.js - Admin API
  - routes/monitoring.js - Monitoring API
  - routes/sync.js - Sync API

- **Scraper Registry** (`lib/scraper-registry.js`)
  - Plugin-based scraper registration
  - Support tier-based scraper retrieval
  - Dynamic source enable/disable

- **Circuit Breaker Pattern** (`lib/circuit-breaker.js`)
  - Circuit breaker for each data source
  - Auto-pause after N consecutive failures
  - Prevents resource waste and error log storms

### API Changes

#### Behavior Changes

| Endpoint | Change | Description |
|----------|--------|-------------|
| All write operations | API Key via Header only | No longer supports `?apiKey=xxx` parameter |
| /api/* | CSP enabled | Browser will enforce CSP policy |
| GET /api/* | Relaxed rate limit | 1000 req/15min (was 100) |
| POST/PUT/DELETE /api/* | Strict rate limit | 10 req/min |

#### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health/detailed` | Detailed health check (includes subsystem status) |

### Migration Guide (v2.0 → v2.1)

1. **Update dependencies**
   ```bash
   npm install
   ```

2. **Update API calls**
   ```bash
   # Old way (no longer supported)
   curl "https://api.example.com/api/refresh?apiKey=xxx"

   # New way
   curl -H "X-API-Key: xxx" https://api.example.com/api/refresh
   ```

3. **Configure CORS (production)**
   ```bash
   # .env
   CORS_ORIGIN=https://your-domain.com
   ```

4. **Run tests**
   ```bash
   npm test
   npm run lint
   ```

5. **Restart service**
   ```bash
   npm start
   ```

---

## v2.0.0

Initial release with core features:
- Multi-source scraping (20+ Web3 data sources)
- AI classification (DeepSeek V3 + 3-level fallback)
- Multi-channel push notifications
- SQLite + Supabase dual storage
- Automated daily/weekly reports
- Data lifecycle management
