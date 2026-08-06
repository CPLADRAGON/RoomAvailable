# Crowd-Sourced Ground Truth ("Is this room actually free?") — Design

_Date: 2026-07-04 · Status: Approved autonomously (user delegated decision-making)_

## Context

`ROADMAP.md` §3.1/§4 identifies this as the #2 highest-leverage mitigation for
the #1 product risk (accuracy/trust): a one-tap "Is this room actually free?"
report that surfaces a short-lived community signal to other users, bridging
the gap between timetable-inferred availability and reality (locked rooms,
ad-hoc bookings, exams not in the public timetable, etc).

**Decision-making note:** as with the data pipeline, the user delegated to
autonomous decision-making. This feature has more open product surface than
the pipeline (report categories, anti-abuse, UI copy) — reasonable, minimal
defaults were chosen and are documented below for later review/adjustment.

## Key decision: storage

Vercel KV is deprecated (migrated to Upstash Redis via the Vercel
Marketplace as of Dec 2024) — using it would require the user to connect a
**second** external service, on top of the Blob store the data pipeline
already needs. To avoid that additional manual-setup burden, this feature
**reuses the same Vercel Blob store** already being requested:

- One small aggregate JSON at a fixed pathname (`reports/latest.json`):
  `{ [venueCode]: { status: "free"|"occupied"|"locked", ts: number }[] }`.
- Each report POST does a read-modify-write: append the new report, prune
  entries older than 30 minutes (both globally and per-venue), write back.
- Trade-off accepted: Blob read-modify-write has a small race window under
  concurrent writes (last-writer-wins on the same venue within the same
  request race). At this app's realistic scale (a free student tool, a
  handful of reports per venue per 30-minute window) this is a non-issue —
  worst case is one report occasionally overwritten by a near-simultaneous
  one, not data corruption.

## API

- **`POST /api/reports`** — body `{ venue: string, status: "free" | "occupied" | "locked" }`.
  Minimal anti-abuse: rejects if `venue` isn't a known 1-64 char string, caps
  stored reports per venue to the most recent 5 (older ones drop off
  naturally), and reports auto-expire from relevance after 30 minutes (still
  physically pruned on next write, not on a schedule — acceptable since Blob
  storage cost here is trivial).
- **`GET /api/reports`** — returns the full pruned map (small: bounded by
  "venues with at least one report in the last 30 min", realistically tiny).
  Cached at the edge for 30s (`s-maxage=30, stale-while-revalidate=60`) since
  reports are inherently a live signal — short TTL, not the 1h/1d used for
  the venues snapshot.

## Client integration

- **`VenueDetail.tsx`**: add a compact "Is this room actually free?" row with
  three buttons (Free / Occupied / Locked) below the status badge. On tap,
  POST the report, show a brief "Thanks!" confirmation, and locally
  rate-limit repeat taps from the same browser to once per 2 minutes per
  venue (via `localStorage`, not a hard server-side guarantee — acceptable
  for a lightweight community signal, not a moderation system).
- Display existing reports for the open venue (if any within the last 30
  min) as a small note near the status badge, e.g. *"2 students reported
  this occupied 5 min ago"* — this is the actual "ground truth" payoff.
- **Not shown on `RoomCard`** (list view) to avoid a second network
  round-trip per card in a long list; only fetched when a venue's detail is
  opened, keeping the list view fast and matching how the existing
  `computeOccupancy` per-card cost model works (computed from already-loaded
  data, no extra fetches).

## Explicitly out of scope (documented, not silently dropped)

- No moderation UI/admin — reports are inherently short-lived (30 min) and
  low-stakes; abuse impact is bounded and self-healing.
- No per-IP server-side rate limiting (would need persistent storage +
  IP hashing infra) — the client-side localStorage cooldown is a reasonable,
  low-effort deterrent for this app's scale and audience (NUS students, not
  an adversarial public API).
- No historical analytics on reports (e.g., "which rooms get reported wrong
  most often") — could be a future addition once real report volume exists.

## Manual steps required

None beyond what the data pipeline already requires (same Blob store,
already documented in `ROADMAP.md` §2.4). No new Vercel dashboard action
needed specifically for this feature.

## Testing / verification plan

- `npm run build`.
- Local dev: POST a report, GET it back, confirm pruning drops entries older
  than 30 minutes (simulate via a manually-inserted stale timestamp).
- Confirm `POST` rejects malformed bodies (missing/invalid `venue` or `status`).
- Playwright: open a venue detail, tap a report button, confirm the
  confirmation UI appears and a subsequent GET reflects it; confirm the
  local cooldown disables repeat taps within the window.
