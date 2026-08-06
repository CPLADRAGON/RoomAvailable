# Self-Hosted Compacted Data Pipeline — Design

_Date: 2026-07-03 · Status: Approved autonomously (user delegated decision-making; see note below)_

## Context

`ROADMAP.md` §2 identified the top infra risk: every browser fetches ~4.4MB
directly from NUSMods' API + GitHub raw every ~12h (4 semesters incl. special
terms), uncached at the origin. At real campus scale this is tens of GB/day
hitting NUSMods' servers — slow on mobile and inconsistent with NUSMods' "use
responsibly" guidance. This was flagged as the single highest-priority
follow-up before a full campus rollout.

This repo previously had a `.github/workflows` Action that fetched and
committed venue data directly to git — it failed with a 403
(`Permission to .../RoomAvailable.git denied to github-actions[bot]`) and was
since removed. The app is currently 100% client-side: no API routes, no
server-side code, static Next.js app on Vercel (not static export).

**Decision-making note:** the user was unavailable to answer the clarifying
question posed (scheduling/hosting mechanism) and explicitly delegated to
"work autonomously and make good decisions." The question was not
ambiguous/unresolvable — there was a clear, well-reasoned recommended
option — so that recommendation was adopted rather than stopping. This is
documented here for the user's later review.

## Approaches considered

1. **Fix the GitHub Actions approach** (re-enable a daily Action that commits
   compacted data to `/public`, triggering a Vercel redeploy). Rejected as
   primary: this is the exact mechanism that already failed once for
   permission reasons; re-attempting it reintroduces the same class of risk
   (branch protection / token permission drift) for no benefit over the
   alternative below.
2. **Vercel Cron + Vercel Blob storage (chosen).** A serverless function runs
   once daily, compacts NUSMods data, writes it to Vercel Blob. The app's own
   `/api/venues` route serves it with edge caching. No git commits involved,
   so the GitHub Actions permission class of failure cannot recur. Requires
   one new dependency (`@vercel/blob`) and one-time Vercel dashboard setup
   (connect a Blob store; Vercel injects `BLOB_READ_WRITE_TOKEN`
   automatically).
3. **Vercel KV / Edge Config.** Rejected: these are designed for small
   key-value data (low KB), not a ~300-600KB compacted JSON document.

## Architecture

```
Vercel Cron (daily, vercel.json)
        │  GET with Authorization: Bearer CRON_SECRET
        ▼
/api/cron/refresh-venues (serverless route)
        │  calls existing fetchVenueData() (src/lib/nusmods.ts — already
        │  isomorphic, no browser-only APIs, reused as-is)
        ▼
Vercel Blob: put("venues/latest.json", ..., { allowOverwrite: true })

Browser
        │  GET /api/venues (same-origin, edge-cacheable)
        ▼
/api/venues (serverless route)
        │  head("venues/latest.json") → fetch blob → return JSON
        │  (Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400)
        │  On Blob miss/error: calls fetchVenueData() live (cold-start
        │  fallback), best-effort writes result to Blob so the next request
        │  is fast, returns JSON with a short cache TTL.
        ▼
Client fetch waterfall (src/hooks/useVenueData.ts):
  Tier 0 (new):      /api/venues — fast, compacted, edge-cached
  Tier 1 (existing): direct NUSMods+GitHub fetch via fetchVenueData()
                      (now a resilience fallback, only used if Tier 0 fails)
  Tier 2 (existing): bundled public/venues_timetable.json (unchanged)
IndexedDB cache (venue-cache.ts, 12h TTL) — unchanged; it's an independent
layer that now simply gets refreshed from Tier 0 instead of Tier 1 directly.
```

## Data format

**Unchanged.** `fetchVenueData()` already returns the app's compact
`VenueMatrix` shape (cluster/type/capacity/lat/lng/roomName/weeks/dates —
already stripped of NUSMods' verbose raw fields). The pipeline does not
introduce a new format; it moves *where* this exact computation runs — once
daily on the server instead of once per user in the browser. `_meta.generated_at`
(already present) is reused as the freshness marker.

## Files touched

- `src/app/api/cron/refresh-venues/route.ts` (new) — protected cron endpoint.
- `src/app/api/venues/route.ts` (new) — public, cached snapshot endpoint.
- `vercel.json` (new) — daily cron schedule (`0 18 * * *` UTC ≈ 02:00 SGT,
  a low-traffic window before the school day).
- `src/lib/nusmods.ts` — unchanged (reused as-is from the new routes).
- `src/hooks/useVenueData.ts` — add the new Tier-0 fetch attempt ahead of the
  existing direct-fetch fallback.
- `package.json` — add `@vercel/blob`.

## Security

`/api/cron/refresh-venues` checks `Authorization: Bearer ${CRON_SECRET}`
(Vercel's standard cron-auth pattern) and rejects all other callers with 401,
so it can't be triggered by outside requests hammering the URL.

## Manual steps required (cannot be done from this CLI)

1. In the Vercel dashboard: **Storage → Blob → Create/Connect** a Blob store
   for this project. This auto-injects `BLOB_READ_WRITE_TOKEN`.
2. In the Vercel dashboard: **Settings → Environment Variables** — add
   `CRON_SECRET` (any random string).
3. Deploy. Vercel registers the cron job from `vercel.json` automatically
   (once-daily fits comfortably within Hobby-tier cron limits).
4. No action needed for the cold-start case — `/api/venues` self-heals by
   calling `fetchVenueData()` live and populating Blob on first miss.

## Testing / verification plan

- `npm run build` (route type-checking).
- Local dev: hit `/api/venues` directly (Blob env vars absent in local dev —
  confirm it gracefully falls through to the live `fetchVenueData()` cold-start
  path rather than crashing).
- Confirm `/api/cron/refresh-venues` returns 401 without the bearer secret and
  succeeds with it (set a local `CRON_SECRET` for the test).
- Confirm the client waterfall still renders venues correctly with Tier 0
  unavailable (simulate a 500/network failure) — Tier 1/Tier 2 must still work
  exactly as before, since this must not regress existing resilience.
