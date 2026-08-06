# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NUS Vacansee — a mobile-first PWA for NUS students to find available rooms on campus in real time. There is **no backend**: the browser fetches NUSMods' per-semester `venueInformation.json` directly (CORS-enabled), normalizes it client-side, caches it in IndexedDB, and computes occupancy entirely client-side using the browser's local clock (Singapore time). App shell is rendered by Next.js; map tiles come from OneMap. See `README.md` for user-facing docs and `ROADMAP.md`/`design.md` for direction.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19), deployed on Vercel
- **Styling:** Tailwind CSS v4, glassmorphic design with NUS corporate colors (see `design.md`)
- **Map:** Leaflet / react-leaflet with OneMap tiles
- **Data Pipeline:** None — fully client-side fetch + normalize (no GitHub Actions, no Python)
- **Data Source:** NUSMods API v2 `venueInformation.json` (`https://api.nusmods.com/v2/{year}-{year+1}/semesters/{sem}/venueInformation.json`, CORS-enabled) for availability, plus NUSMods `venues.json` (per-venue coordinates / room names / floors). Map tiles from OneMap (Singapore Land Authority).

## Attribution & Responsible Use

NUSMods is **MIT-licensed** and provides a public API; we use it responsibly
(fetch at most once per ~12h, cached, with a static fallback snapshot). The app
credits NUSMods and OneMap/SLA in the footer, and the `README.md` Acknowledgements
section contains the full MIT notice and data-source disclosures. This project is
independent and not affiliated with NUS. Keep these credits intact and avoid
hammering the NUSMods endpoints.

## Architecture at a Glance

Single-page app: `src/app/page.tsx` owns the whole UI (view state, filters,
ranking). Data flows:

1. `useVenueData` (`src/hooks/useVenueData.ts`) loads a `VenueMatrix` — either from
   IndexedDB (`lib/venue-cache.ts`), freshly fetched from NUSMods (`lib/nusmods.ts`),
   or the bundled fallback snapshot (`public/venues_timetable.json`).
2. `computeOccupancy` (`lib/occupancy-engine.ts`) marks every venue vacant/occupied/
   crunch for the current Singapore time + semester/week; a 30s tick re-runs it.
3. `page.tsx` builds two views from the same `withOccupancy` list: the **near-me**
   list (vacant rooms ranked by distance → longest free block) and the **browse**
   list (cluster / search / saved / all-venues filters). A `list | map` toggle renders
   either `RoomGrid` or `MapView`.

## Project Structure

```
src/
  app/            — Next.js App Router pages (layout.tsx, page.tsx, globals.css)
  components/     — UI: LocationPrompt, RoomGrid, RoomCard, StatusBadge, VenueDetail,
                    VenueMiniMap, WeekGrid, MapView, FeedbackModal, ServiceWorkerRegister
  lib/            — occupancy-engine.ts, calendar.ts, cluster-map.ts, cluster-rules.ts,
                    nusmods.ts, venue-cache.ts, room-classify.ts, directions.ts, geo.ts,
                    standalone.ts
  hooks/          — useGeolocation.ts, useVenueData.ts, useFavorites.ts, useRecents.ts
  types/          — index.ts (TimetableSlot, VenueEntry, VenueMatrix, OccupancyInfo, …)
  data/           — clusters.ts (faculty GPS centroids), buildings.ts (curated coords)
public/           — venues_timetable.json (offline fallback snapshot), manifest.json, sw.js, icons
```

## Key Design Decisions

### Data Layer (client-side)
- `lib/nusmods.ts` fetches both semesters' `venueInformation.json` in parallel and normalizes into the `VenueEntry`/`TimetableSlot` shape; `weeks` is flattened from its three NUSMods encodings (`number[]`, `{start,end,weeks}`, `{start,end,weekInterval}`)
- Academic year + semester dates derived client-side in `lib/calendar.ts` (August cutoff; Sem 1 = 2nd Monday of Aug, Sem 2 = 2nd Monday of Jan, 17 weeks)
- Cluster mapping via prefix rules in `lib/cluster-rules.ts`: COM→Computing, E1/E2/EA→Engineering, UT→UTown, etc.
- Venues prefixed with `E-LEARN_`, `ONLINE`, `TBA`, or `_` are excluded; `useVenueData`'s `fromMatrix` also skips any matrix key starting with `_` (e.g. the `_calendar` payload)
- `useVenueData` uses **stale-while-revalidate**: render from IndexedDB cache instantly → refetch from NUSMods only if cache is stale (>12h TTL) → fall back to bundled `/public/venues_timetable.json` snapshot if the network/CORS fails
- `lib/venue-cache.ts` stores the normalized dataset in IndexedDB with a `fetchedAt` timestamp and `DATA_SCHEMA_VERSION`; old caches are purged on version bump; the footer's "Refresh data / clear cache" control calls `clearCache()` (IndexedDB + SW caches) then `refresh()`

### Occupancy Engine
- Singapore time via `Intl` with `Asia/Singapore` timezone; 30-second live tick
- Slot matching: checks current HHMM against today's slots for the current semester + week
- Computes a vacant room's remaining free block (`freeMinutes`, `freeUntil`) for ranking
- Between semesters: banner shown, all rooms display as vacant

### Location & the "near me" view
- **Auto-locate is deliberately conservative** (see `page.tsx` + git history): on load the app only calls `geo.requestLocation()` when the Permissions API already reports `granted` — a gesture-less request is often auto-denied by browsers. For "ask"/unknown states it waits for the user to tap the locate button, so the prompt fires inside a real user gesture. Never "fix" this by requesting location eagerly on mount.
- `lib/standalone.ts` `isStandalone()` detects installed/home-screen (standalone display-mode) web apps to tailor the location guidance copy.
- **Ranking:** near-me sorts vacant rooms by `venueDistance` (`lib/cluster-map.ts`, planar distance to precise venue coords else cluster centroid) then longest free block then code. Displayed distances are `haversineMeters` + `formatDistance` + `walkMinutes` (~80 m/min walk) from `lib/geo.ts`. No location → rank by longest free block only.
- Browse mode (`cluster || search || savedOnly || showAll`) overrides near-me. Filters: cluster pills, room-type filter (`RoomType`), free-for ≥1h/2h/3h, saved-only, and "All venues". Limits: `NEAR_ME_LIMIT = 60`, `MAP_PIN_LIMIT = 200`.

### Room type & coordinates resolution
- `lib/room-classify.ts` `classifyRoom()`: unambiguous venue-code rules (LAB→Lab, LT→Lecture Theatre, SR/TR→Seminar/Tutorial) take precedence; otherwise the dominant lessonType wins (with capacity ≥100 as a Lecture Theatre/Classroom tie-break).
- `lib/directions.ts` resolves a venue to a map destination in three tiers: exact NUSMods venue coordinates → curated building table `data/buildings.ts` (keyed by venue-code prefix before `-`/`_`, e.g. `COM1-0210`→COM1) → faculty cluster centroid (flagged `approx`). `mapsUrl()` opens a universal Google Maps `dir/?api=1` link.

### Map view
- `MapView.tsx` is SSR-disabled (`dynamic(..., { ssr: false })`) — Leaflet touches `window`. OneMap tile layer; pins only render for venues that have precise lat/lng. Status colors: vacant green / occupied red / crunch amber; "you are here" marker when geolocated; popup links to the details modal and Google Maps directions.

### Favorites & recents
- `useFavorites.ts` / `useRecents.ts` persist to `localStorage` (`vacansee_favorites`, `vacansee_recents`); recents are MRU capped at 8. State hydrates in `useEffect` (no SSR persistence). Favorites power the "saved only" filter and the ★ toggles.

### Frontend / PWA
- **No active service worker** — it caused stale code across deploys. `public/sw.js` is a self-destroying "kill-switch" (installs, clears all caches, unregisters, reloads tabs), and `ServiceWorkerRegister` proactively unregisters any worker and deletes old `spacefinder*` caches. Offline resilience comes from the bundled `venues_timetable.json` fallback fetch, not SW caching. Don't reintroduce SW app-shell caching without revisiting the stale-deploy problem.
- Tapping a room opens a detail modal (`VenueDetail`) with a full day/week schedule (`WeekGrid`) and a mini-map (`VenueMiniMap`).
- Feedback button opens `FeedbackModal`: posts to `NEXT_PUBLIC_FEEDBACK_ENDPOINT` (Formspree/Tally) or falls back to a `NEXT_PUBLIC_FEEDBACK_EMAIL` mailto. Both env vars are optional; the app runs without them.

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server on http://localhost:3000
npm run build      # production build (runs type check)
npm run start      # serve the production build
```

There is no lint or test script configured (Next.js 16 default build includes type checking). Feedback endpoint config lives in `.env.example` (`NEXT_PUBLIC_FEEDBACK_ENDPOINT`, `NEXT_PUBLIC_FEEDBACK_EMAIL`).
