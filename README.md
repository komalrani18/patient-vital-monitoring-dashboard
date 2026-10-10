# Smart Hospital Patient Vitals Dashboard

A ward-monitoring dashboard built around three scaling problems: aggregating a million telemetry rows without timing out, not recomputing the same aggregation for every viewer, and rendering thousands of table rows without freezing the browser. All data is synthetic.

**Stack:** React (Vite) · Tailwind CSS v4 · Recharts · @tanstack/react-virtual · Node.js · Express 5 · MongoDB (Mongoose) · Redis (ioredis)

## Run it

You need Node 20.19+ and Docker.

```bash
docker compose up -d                 # MongoDB 7 + Redis 7

cd server
npm install
npm run seed                         # inserts 1,000,000 readings, then builds the indexes
npm run dev                          # API on http://localhost:4000

cd ../client                         # in a second terminal
npm install
npm run dev                          # UI on http://localhost:5173
```

`npm run seed -- 250000` seeds a smaller dataset. The seed drops the collection first, so it is safe to re-run.

## The three bottlenecks

| Bottleneck | What fixes it | Where |
| --- | --- | --- |
| Querying a million rows | Compound indexes in ESR order (one covers the whole aggregation), and a `$match` → `$group` pipeline that runs inside MongoDB, so the client receives a few KB instead of raw documents | `server/src/models/VitalTelemetry.js`, `server/src/routes/analytics.js` |
| Recomputing the same aggregation | Redis cache-aside with a 5-minute TTL. Canonical cache keys, single-flight de-duplication of concurrent misses, and fail-open if Redis is down | `server/src/lib/cache.js`, `server/src/lib/redis.js` |
| Rendering thousands of rows | UI virtualization: about 20 rows exist in the DOM however long the list is | `client/src/components/IncidentLog.jsx` |

The seed script (`server/src/scripts/seed.js`) applies the same thinking to writes: 10,000-document `bulkWrite` batches, generation overlapped with the previous write, and indexes built after the load instead of during it.

## API

`GET /api/analytics/ward-trends?ward=ICU&startDate=2026-09-11&endDate=2026-10-10&interval=day`
One row per day or hour: `bucket`, `avgHeartRate`, `avgSpo2`, `criticalCount`, `readings`. Cached for 5 minutes. The response header `X-Cache` is `HIT`, `MISS`, or `BYPASS` (Redis unreachable), and `meta.durationMs` is the server time.

`GET /api/incidents?ward=ICU&startDate=2026-09-11&endDate=2026-10-10&limit=5000`
Newest WARNING and CRITICAL readings first (default 5,000, maximum 10,000). Not cached.

Both validate their input and answer errors as `{ "error": "..." }` with a 400. `ward` is one of `ICU`, `Cardiac-Care`, `General`, `Post-Op`. Dates are `YYYY-MM-DD` only (this keeps cache keys canonical), and the range is limited to 92 days.

## Configuration

Set as environment variables. Every one has a default that works with `docker-compose.yml`.

| Variable | Default |
| --- | --- |
| `PORT` | `4000` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/vitals_dashboard` |
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `CLIENT_ORIGIN` | `http://localhost:5173` (CORS) |
| `CACHE_TTL_SECONDS` | `300` |

For a split deployment, build the client with `VITE_API_URL=https://your-api.example.com`.

## See the optimizations working

- **Cache:** open the dashboard. The badge above the chart says "From database" with the compute time. Click **Refresh data**: the same request now says "From cache" and is typically much faster. Or run the `curl` below twice and compare `X-Cache`.
  ```bash
  curl -si 'http://localhost:4000/api/analytics/ward-trends?ward=ICU&startDate=2026-09-11&endDate=2026-10-10' | grep -i '^x-cache'
  ```
- **Indexes:** in `mongosh`, check that the aggregation is served from `ward_ts_covering` rather than a collection scan.
  ```js
  db.vital_telemetry.explain('executionStats').aggregate([
    { $match: { ward: 'ICU', timestamp: { $gte: ISODate('2026-09-11'), $lt: ISODate('2026-10-11') } } },
    { $group: { _id: { $dateTrunc: { date: '$timestamp', unit: 'day' } }, avgSpo2: { $avg: '$metrics.spo2' } } },
  ])
  ```
  Look for an `IXSCAN` on `ward_ts_covering` and `totalDocsExamined: 0`.
- **Virtualization:** in browser DevTools, count the `[role="row"]` elements while the log says 5,000 alerts are loaded.

## Where to go next

- Store telemetry in a MongoDB **time-series collection** in production, which compresses and buckets by time natively.
- Replace the single-process single-flight with a Redis lock (`SET key value NX PX`) when running several API instances.
- Stream new incidents over Server-Sent Events instead of the Refresh button.
- A hospital-wide view across all wards needs its own index or a merge of per-ward results, since the current indexes lead with `ward`.
