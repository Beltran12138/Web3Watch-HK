# Alpha-Radar "Industry Brain" Upgrade Plan (v1.5.0)

## Objective
Transform Alpha-Radar from a news aggregator into an intelligent industry brain by adding memory, interactive capabilities, and proactive alerting.

## Key Files & Context
- `db.js`: Current database layer (SQLite/Supabase).
- `dao.js`: (New) Data Access Object layer.
- `ai-enhanced.js`: AI processing logic with fallback.
- `push-channel.js`: Multi-channel push notification logic.
- `monitor.js`: (New) Real-time intelligence density monitor.
- `config.js`: Global configurations.

## Implementation Steps

### Phase 1: Database & Memory Architecture
1. **Refactor `db.js` & Create `dao.js`**:
    - Abstract `news` and `source_tracking` operations into `NewsDAO`.
    - Add `insights` table: `id, trend_key, summary, evidence_count, first_seen, last_updated`.
    - Implement `InsightDAO` to manage trend storage and retrieval.
2. **Memory Sync Logic**:
    - Update `DataLifecycleManager` to handle insights.

### Phase 2: AI Intelligence & Validation
1. **Zod Integration**:
    - Define `Zod` schemas for News Analysis and Batch Classification.
    - Replace fragile `JSON.parse` with `schema.safeParse`.
2. **Context-Aware Prompting**:
    - Modify `processWithAI` to optionally take `recentInsights`.
    - Update prompt to encourage referencing existing trends (e.g., "This aligns with the RWA trend recorded on Mar 10").

### Phase 3: Push & Interaction
1. **Interactive Links**:
    - Modify `WeComChannel` to append a "Deep Ask" URL to messages.
    - The URL will point to the web frontend with a `query` parameter pre-filled.
2. **Proactive Alerting**:
    - Implement `IntelligenceDensityMonitor`:
        - Use a sliding window (e.g., 30 mins) to track keyword frequency across different sources.
        - Trigger `pushManager.sendImportant()` if frequency > threshold.

### Phase 4: Perception Layer & Reliability
1. **Crawler Perception**:
    - In `scrapers/browser.js`, record `lastKnownGoodHash` for each source.
    - If a crawler returns empty results while the hash changed significantly, flag it as "Structure Changed".

### Phase 5: Data Export
1. **Anonymized Export**:
    - Create `npm run export:train` script.
    - Strip URLs and PII, output JSONL format (Prompt-Completion pairs).

## Verification & Testing
- Run `npm run test:dao` to verify the new DAO layer.
- Run `npm run test:monitor` with mock data to trigger alerts.
- Verify WeCom push has the new "Deep Ask" link.
- Check `insights` table population after a weekly report run.
