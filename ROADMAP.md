# NUS Vacansee — Roadmap & Deployment Evaluation

_Last updated: 2026-07-06 (data pipeline & crowd reports confirmed live in production) · Living document_

This document captures (1) an honest evaluation of whether the current
deployment can scale to real student usage, and (2) a prioritized roadmap to
turn Vacansee from a working prototype into a tool NUS students actually rely on.

It is informed by reviewing **NUSMods** (its public API, venue data, and the
"use responsibly" guidance), the **OneMap** basemap dependency, common
university "free-room finder" patterns, and direct measurements of our data
dependencies.

---

## 0. Rollout readiness verdict (TL;DR)

**Very close — infra confirmed live in production; one deliberate product gap remains:**

| Area | Status | Verdict |
|---|---|---|
| **Hosting/compute** | Static SPA on Vercel, all occupancy math runs client-side | ✅ **Ready.** Scales to hundreds of thousands of visits/month for free. |
| **Data-fetch path** | Self-hosted compacted data pipeline **confirmed live and running on schedule (2026-07-07)** — Blob connected, `CRON_SECRET` set, daily cron verified executing (manual trigger + `generated_at` freshness both checked). See §2.4. | ✅ **Live and verified.** |
| **Accuracy/trust** | Class-timetable availability + crowd-sourced reports (**verified end-to-end live, 2026-07-06/07** — a real report was submitted and displayed correctly) + honest "no data"/last-updated signals + correct NUS academic calendar (incl. special terms) | ⚠️ **Solid, one deliberate gap:** opening-hours/access awareness is not implemented (no public data source) — see §4. |
| **Usage visibility** | Vercel Web Analytics wired in (2026-07-03), **Enable confirmed clicked (2026-07-06)** | ✅ **Live.** |
| **Live QA pass** | Full browser-based QA against production (2026-07-07): homepage, browse/search, venue detail, timetable, crowd reports, directions, map, mobile, modals, PWA manifest — all clean. One real bug found and fixed (search dropdown Escape key), one pre-existing hydration timing issue found and fixed (header clock), two documentation-only findings (payload size, Cache-Control header behavior) resolved by updating this doc. | ✅ **Passed.** See "Live QA findings" below. |

**Bottom line:** every "Now" priority infra/trust item is done and *verified live*, not just shipped. There is no remaining *unknown* blocker — what's left is a single product decision about whether to launch without opening-hours awareness or wait. See the pre-launch checklist below.

### Live QA findings (2026-07-07)
A full browser-based QA pass was run against `https://nus-vacansee.vercel.app` (Playwright), covering every core flow. Findings and resolutions:
- **Fixed:** search suggestions dropdown didn't close on `Escape` (`LocationPrompt.tsx` had no keydown handler, only click-outside). Added.
- **Fixed:** header clock occasionally triggered a React hydration mismatch (error #418) — the clock value was computed once during SSR and again on client hydration, and if a minute boundary fell in between, the text differed. Fixed by rendering the clock text client-only (mount-gated), leaving the underlying `now` state (used for occupancy calculations) untouched.
- **Documented (no code change needed):** `/api/venues` payload is ~2.5MB decompressed (bigger than this doc's old estimate — see §2.4) and its `Cache-Control` header is normalized by Vercel's edge — both confirmed harmless with live evidence, details in §2.4.
- **Deliberately not touched:** opening-hours/access gap (see §4, §6).

### Pre-launch checklist
- [x] Core availability engine correct (NUS academic calendar incl. special terms, honest occupancy states)
- [x] Scales without cost/responsibility risk to NUSMods (data pipeline live and verified running on schedule)
- [x] Trust signals in place (last-updated, "no data" honesty, crowd-sourced corrections — all verified working live)
- [x] Legal/attribution (NUSMods MIT credit, OneMap/SLA credit, "not affiliated with NUS" disclaimer, Acknowledgements page)
- [x] Usage analytics wired and enabled
- [x] Full live QA pass completed (2026-07-07) — see findings above
- [ ] **Decision needed:** launch now accepting the opening-hours/access gap (mitigated by "verify on site" caveats + crowd reports), or wait for organic crowd-report signal to partially cover it first
- [ ] Optional: prepare where you'll announce (NUS Telegram groups, r/NationalUniversityofSingapore, class group chats, etc.) — worth planning alongside the tech readiness

---

## 1. Where we are today

**What works**
- Fully client-side: the browser fetches NUS timetable + venue data, computes
  occupancy with the local clock, and renders everything (no backend).
- "Available now near you" ranking, live status, NUSMods-style weekly timetable,
  room type + approximate capacity, cluster/type/duration/saved filters, search,
  Google Maps directions, an OneMap map view, favorites/recents, installable PWA.
- Attribution to NUSMods (MIT) and OneMap/SLA; in-app feedback.
- **Vercel Web Analytics** for aggregate, privacy-friendly usage/volume tracking.

**Core limitation (the thing that decides adoption):** availability is inferred
from **class timetables only**. It does **not** know about ad-hoc bookings, CCA
usage, events, maintenance, locked/card-access rooms, or building opening hours.
A student who walks to a "free" room and finds it occupied or locked loses trust
fast. **Accuracy & trust is the #1 product risk** — see §4.

---

## 2. Deployment & scalability evaluation

### 2.1 Architecture in one line
Static Next.js SPA on Vercel + browser-side fetch of third-party data
(NUSMods API, GitHub raw, OneMap tiles) cached in IndexedDB (~12h).

### 2.2 Measured facts (2026-06-17)
| Dependency | Source | Size | Caching | Risk |
|---|---|---|---|---|
| `venueInformation.json` (×2 semesters) | `api.nusmods.com` (Cloudflare) | ~2.13 MB each (~4.3 MB total) | `cache-control: null`, `cf-cache-status: DYNAMIC` (origin-served, **not** edge-cached) | **High** at scale |
| `venues.json` (coords/room names) | `raw.githubusercontent.com` | ~0.11 MB | `max-age=300` | **Medium** (GitHub raw is rate-limited, not for production) |
| Map tiles | `onemap.gov.sg` | ~17 KB/tile | `max-age=14400` (4h) | **Medium** (external rate limits / ToS) |
| App shell + JS | Vercel edge | small (static SPA) | hashed/immutable | **Low** |

### 2.3 Verdict
- **Our hosting scales well.** The app is a static SPA; Vercel serves a few
  hundred KB per first load (then cached). Vercel's free (Hobby) bandwidth
  comfortably handles hundreds of thousands of first-loads/month. Client-side
  compute runs on user devices, so it scales for free.
- **The third-party data path does not scale responsibly.** Because
  `venueInformation.json` is **DYNAMIC (uncached)** and ~4.3 MB per refresh,
  every active user pulls ~4.3 MB from NUSMods' origin every ~12h. At, say,
  10,000 daily active users that's on the order of **tens of GB/day hitting
  NUSMods' origin** — slow on mobile data and not aligned with NUSMods' "use
  responsibly" request. `venues.json` via GitHub raw can be throttled outright.

### 2.4 Recommended infra change (high priority)

~~Introduce a build-time / scheduled data pipeline that we host ourselves~~
**Done (2026-07-03), confirmed live in production (2026-07-06/07).** Design:
`docs/superpowers/specs/2026-07-03-data-pipeline-design.md`.

- **Vercel Cron** (`vercel.json`, daily at 18:00 UTC / ~02:00 SGT) triggers a
  protected route (`/api/cron/refresh-venues`, guarded by a `CRON_SECRET`
  bearer token) that re-runs the existing `fetchVenueData()` normalization
  (unchanged — the same isomorphic function that used to run per-user in the
  browser now runs once/day server-side) and writes the result to **Vercel
  Blob** at a fixed pathname.
- The app's own **`/api/venues`** route serves that snapshot with
  `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, so
  Vercel's CDN absorbs almost all requests regardless of visitor count.
  **Live-verified (2026-07-07):** the client-facing response header is
  normalized down to just `Cache-Control: public` by Vercel's edge (it does
  not echo the raw `s-maxage`/`stale-while-revalidate` values), but the
  directive is honored internally — confirmed via `x-vercel-cache: HIT` and
  `age: 576` (~9.6 min into the 1h window) on a real production request. This
  is Vercel normalizing the client-visible header, not a bug; no action needed.
- **Cold-start / resilience:** if Blob is empty or unreachable (first deploy,
  before the first cron tick, or any Blob outage), `/api/venues` transparently
  falls back to a live `fetchVenueData()` call and best-effort re-warms Blob —
  it never fails just because the daily job hasn't run yet.
- **Client waterfall** (`useVenueData.ts`): Tier 0 `/api/venues` (new,
  preferred) → Tier 1 direct NUSMods+GitHub fetch (existing `fetchVenueData()`,
  now a resilience fallback only) → Tier 2 bundled `public/venues_timetable.json`
  (existing, unchanged). The 12h IndexedDB cache layer is untouched.
- **Deliberately avoided the GitHub Actions approach** — that's the exact
  mechanism that failed with a 403 permission error early in this project
  (see the top of this doc's history). Vercel Cron + Blob has no git-commit
  step, so that class of failure cannot recur.
- **Payload size (measured live, 2026-07-07):** `/api/venues` is **~2.5MB
  decompressed** (644 venues) — larger than this doc's original "~300–600KB"
  estimate, which pre-dated adding 2 special-term semesters and richer
  per-class fields (`lessonType`, `classNo`, `dates`). Real-world impact is
  low: Vercel serves it Brotli-compressed over the wire, and it's edge-cached
  (confirmed `HIT` in production), so this isn't a live problem — but it's
  worth revisiting field-level compaction if usage grows enough to make the
  origin-refresh cost or client parse time noticeable.

**Production status (confirmed 2026-07-06/07):** the Blob store is connected,
`CRON_SECRET` is set, the daily cron has run successfully (verified via a
manual trigger — 200, fetched all 4 semesters + `venues.json` in ~5s — and via
`/api/venues`'s `generated_at` matching the scheduled run time), and
crowd-sourced reports have been verified working end-to-end live (a real
report was submitted, stored, and displayed correctly). Setup steps below are
kept for reference / disaster-recovery:

1. Vercel dashboard → **Storage → Blob → Create/Connect** a Blob store for
   this project. Depending on how your account is set up, Vercel auto-injects
   either the classic `BLOB_READ_WRITE_TOKEN` **or** the newer OIDC-based
   `BLOB_STORE_ID` + an automatic `VERCEL_OIDC_TOKEN` at runtime — both are
   supported by `@vercel/blob` and by our `isBlobConfigured()` check.
2. Vercel dashboard → **Settings → Environment Variables** → add `CRON_SECRET`
   (any random string).
3. Redeploy — Vercel registers the cron schedule from `vercel.json` automatically.

If Blob or `CRON_SECRET` were ever removed, `/api/venues` still works
correctly (cold-start fallback path), so nothing would break — it would just
lose the bandwidth/scale benefit until reconnected.

**Benefits:** ~10× smaller payload, fast on mobile, removes the GitHub-raw rate
limit, and reduces NUSMods origin load from "per user" to "once per day for the
whole app" — far more responsible and far more scalable.

### 2.5 Other infra notes
- **Vercel Hobby is non-commercial.** A free student tool is generally fine; if
  it grows or is monetized, move to Vercel Pro or **Cloudflare Pages / GitHub
  Pages** (both free, generous for static SPAs).
- **OneMap**: keep attribution; register for an API key if tile volume grows or
  ToS requires it. Consider a fallback basemap.
- We removed the service worker (it caused stale-code issues). If we re-add
  offline support later, ship a **versioned, network-first** worker with a tested
  update path (we already learned this the hard way).
- ~~Add lightweight, privacy-respecting analytics (e.g., Plausible/Umami) to
  understand real usage and guide the roadmap.~~ **Done (2026-07-03).** Wired
  up **Vercel Web Analytics** (`@vercel/analytics` in the root layout) — no
  cookies/PII, free tier. Requires a one-time **Enable** click in the Vercel
  dashboard's Analytics tab per project to start collecting data.

---

## 3. Feature roadmap

Phased by impact-vs-effort. "Now" items most directly make Vacansee trustworthy
and usable; "Later" items are platform bets.

### 3.1 Now (accuracy, trust, scale) — highest priority
- ~~**Self-hosted compacted data pipeline** (see §2.4) — scale + speed + responsibility.~~
  **Code shipped (2026-07-03)** — see §2.4 for details and the required
  one-time Vercel dashboard setup (Blob store + `CRON_SECRET`) to activate it
  in production.
- **Building opening hours & access awareness.** Mark rooms as
  "open / card-access only / closed" by time of day and day of week; many NUS
  buildings are locked or card-only after hours. Prevents the worst false
  positives. *(Explicitly deferred to a future pass — no public, structured
  data source exists for this; it needs either manual curation or
  crowd-sourcing, see §6.)*
- ~~**Calendar awareness beyond term:** handle **reading/exam weeks, vacation,
  public holidays, and special terms**.~~ **Done (2026-06-30).** Ported NUSMods'
  `nusmoderator` academic calendar logic; the app now correctly resolves Sem 1,
  Sem 2, Special Terms (3 & 4), recess, reading, and exam weeks via date-based
  scheduling. A banner warns users during periods where timetable data is sparse.
- ~~**Crowd-sourced ground truth.** A one-tap "Is this room actually free?"
  (Free / Occupied / Locked) on the detail page that feeds a short-lived live
  signal shown to others ("2 students reported this occupied 5 min ago"). This
  bridges timetable-vs-reality cheaply (needs a tiny backend or a serverless
  function + KV store).~~ **Done (2026-07-04).** Design:
  `docs/superpowers/specs/2026-07-04-crowd-reports-design.md`. `/api/reports`
  (serverless, reuses the same Blob store as the data pipeline — Vercel KV is
  deprecated/migrated to a paid Marketplace Redis integration, so this avoids
  a second manual external dependency) stores the last 5 reports per venue,
  pruned after 30 minutes. `VenueDetail` shows a compact Free/Occupied/Locked
  report row plus a "N students reported X Y ago" summary when reports exist,
  with a client-side 2-minute per-venue cooldown to deter accidental repeat
  taps.
- ~~**Trust UI:** always-visible "last updated", a clear "computed from class
  timetables — verify on site" note, and a confidence indicator.~~ **Done
  (2026-07-04).** Honest timetable states (vacant / class ending soon / free
  later), "please verify on site" caveat in the Special Term banner, graceful
  class labels with lesson type + class number, a per-venue "Data updated Xm/h
  ago" line in the detail view (using the pipeline's freshness timestamp), and
  a confidence qualifier — "No classes on record for this room today — please
  verify on site" — shown when a vacant room has zero timetable entries for
  today at all (distinguishing "confirmed free from a real schedule" from
  "no data, shown free by default").

### 3.2 Next (usability depth)
- **Capacity / "seats ≥ N" filter** and **accessibility info** (lift access,
  wheelchair-friendly) where data exists.
- **Plan-ahead time picker:** "what's free at 2pm?" / "free for my 1-hour gap."
- **Smarter search:** building aliases, fuzzy matching, recents in search.
- **Library seat availability** integration (NUS Libraries publishes live seat
  counts) — a top student need for study spots.
- **Indoor/last-leg guidance:** building entrance pin + floor/room hints
  (we already store `roomName` + `floor`).
- **Re-introduce a robust offline PWA** (versioned network-first SW) now that the
  data is small and self-hosted.
- **Personalization:** remember preferred clusters, default duration, dark mode.

### 3.3 Later (platform & partnerships)
- **Official data / booking integration.** Partner with NUS facilities or
  integrate the official room-booking system for ground-truth availability and
  even in-app booking — the single biggest credibility unlock.
- **Push notifications:** "a room near you just freed up" (note: iOS PWA push is
  limited; may need careful UX or a native shell).
- **Crowd / busyness levels** for common areas and study clusters.
- **Group coordination:** share a room/spot with friends, "meet here" links.
- **Facilities analytics** (aggregate, anonymized) potentially useful to the
  university for space planning.

---

## 4. The #1 risk: accuracy & trust (read this first)

Timetable-based availability is necessary but **not sufficient**. The product
stands or falls on whether a "free" room is actually free and accessible. The
cheapest high-leverage mitigations, in order:

1. ~~**Honest caveats + last-updated** (done partially) — set expectations.~~ **Done.**
2. **Opening hours / access state** — eliminate "locked room" false positives.
   *(Explicitly deferred — no public data source; needs manual curation or
   crowd-sourcing, see §6.)*
3. ~~**Crowd-sourced confirmations** — cheap real-time correction layer.~~ **Done (2026-07-04).**
4. ~~**Special-period handling** (exams/vacation) — avoid confidently-wrong states.~~ **Done.**
5. **Official data** — the eventual source of truth.

Ship 1–3 before heavy marketing; otherwise early users churn after one bad walk.
**1, 3, and 4 are done; 2 (opening hours) remains the biggest open gap for
avoiding locked-room false positives specifically.**

---

## 5. Suggested next concrete step

~~Build the self-hosted compacted data pipeline (§2.4).~~ **Done (2026-07-03)**
— code is shipped; activation just needs the one-time Vercel dashboard setup
described in §2.4 (Blob store connect + `CRON_SECRET`).

~~Crowd-sourced ground truth (§3.1).~~ **Done (2026-07-04)** — `/api/reports`
shipped, reusing the same Blob store; no additional manual setup needed
beyond what §2.4 already requires.

**New suggested next step:** with both the data pipeline and crowd-sourced
reports in place, the remaining "Now" gap is **building opening hours &
access awareness** (§3.1) — deliberately deferred earlier since it needs
either manual per-cluster research or waiting for real crowd-report volume to
emerge organically (a room repeatedly reported "locked" is itself a signal
about its access hours, for free, from the feature just shipped).

---

## 6. Open questions / decisions

- ~~Is a small backend acceptable (for crowd-sourced reports + scheduled
  pipeline), or do we stay strictly static?~~ **Decided (2026-07-03):** yes —
  the data pipeline now uses two small Vercel serverless routes
  (`/api/venues`, `/api/cron/refresh-venues`). The same pattern (a tiny
  serverless function + storage) is the natural home for crowd-sourced
  reports too.
- Hosting: stay on Vercel Hobby, or move static hosting to Cloudflare/GitHub
  Pages for headroom and clearer ToS?
- Do we pursue an official NUS data/partnership track, or remain community-run?
- Scope of "opening hours" data — can we source it, or crowd-source it too?
