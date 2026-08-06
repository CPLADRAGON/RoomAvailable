# DESIGN.md: Campus Room Available

This document establishes the UI/UX visual language, architectural framework, and engineering blueprints for the Smart Campus Room Finder web application. This file serves as the strict token and architectural reference for downstream AI coding agents to build a pixel-perfect, functionally complete, pure-software MVP.

---

## 1. Visual Language & Design Tokens

This system implements **Corporate Neo-Minimalism with Glassmorphic Accents**, blending the institutional gravity of the National University of Singapore (NUS) with an agile, high-contrast, data-dense layout.

### 1.1 Color Palette
* **Primary (NUS Blue):** `#003D7C` (Deep, commanding, used for baseline structure, primary actions, and headers)
* **Accent (NUS Orange):** `#EF7C00` (Energetic, high-visibility, used for highlights, status indicators, and micro-interactions)
* **Background Base:** `#F4F6F9` (Cool, low-saturation slate grey to ease glare during campus navigation)
* **Surface Base (Glassmorphic Panels):** `rgba(255, 255, 255, 0.75)` with a backdrop blur of `12px` and a thin border tint of `rgba(255, 255, 255, 0.4)`.
* **Semantic Feedback Colors:**
    * *Vacant Status (Green):* `#10B981` (Emerald)
    * *Occupied Status (Red):* `#EF4444` (Rose)
    * *Class-in-Progress / Crunch Hour (Amber):* `#F59E0B`

### 1.2 Typography (System-Native Font Stack)
* **Display & Headings:** `Inter, system-ui, -apple-system, sans-serif`
    * Weight: `700` (Bold) or `600` (Semi-bold)
    * Letter Spacing: `-0.02em` tracking for a dense, crisp modern UI feel.
* **Body & Tabular Data:** `Inter, SF Pro Text, Apple SD Gothic Neo, sans-serif`
    * Weight: `400` (Regular), `500` (Medium)
* **Monospace Tokens (Venues/Module Codes):** `JetBrains Mono, SFMono-Regular, monospace` (For codes like `CS1010`, `COM1-0206`, `LT21`).

### 1.3 Key Component Signatures
* **Cards:** No heavy solid backgrounds. Use the Glassmorphic Surface Token, a corner radius of `14px`, and a crisp bottom-drop shadow: `box-shadow: 0 4px 30px rgba(0, 0, 0, 0.03)`.
* **Buttons:** * *Primary:* Solid `#003D7C` with sharp, slight text shadowing and `8px` rounding.
    * *Secondary:* Translucent, thin-bordered glass buttons that scale up dynamically by `1.02x` on pointer hover.

---

## 2. UI Layout Architecture (Mobile-First Dashboard)

The interface follows a single-page progressive disclosure pattern optimized for students walking around campus with smartphones.

### 2.1 Viewport Layer 1: Macro Header & Spatial Anchor
* **Brand Banner:** Minimal top bar with the distinctive NUS Blue/Orange accent rule. Title read: `NUS SpaceFinder`.
* **Location Prompt Widget:**
    * A clean geolocation request container that reads the browser Geo-location coordinate.
    * A rapid selection pills row: `[📍 Auto-Detect Cluster]` `[COM Computing]` `[ENG Engineering]` `[UTown]` `[FASS]`.
    * An instant fuzzy autocomplete search field with the placeholder `"Search building, block or LT code (e.g., E3, COM1)..."`.

### 2.2 Viewport Layer 2: Live Room Status Grid
* Displays a dynamic list of rooms grouped by geographical clusters.
* **Each Room Card contains:**
    * `Venue Identification Number` (Large Monospace, e.g., **E3-06-02**)
    * `Status Badge` (Pill format with matching semantic background: `● VACANT UNTIL 16:00` or `● OCCUPIED (CS2103T Lecture)`).
    * `Next Event Countdown` (Subtle metadata timeline showing the next upcoming module block from the NUSMods static timetable array).

---

## 3. System Architecture & Data Pipeline

To maintain zero-cost, zero-backend deployment on Vercel, the app fetches
NUSMods data **directly in the browser** and computes everything client-side.
There is no GitHub Actions cron and no Python parser.
┌────────────────────────┐
   │   NUSMods API v2       │
   │ venueInformation.json  │  (per-semester, CORS-enabled)
   └───────────┬────────────┘
               │
               ▼ (fetched directly by the browser, once per ~12h)
┌─────────────────────────────────────────────────────────┐
│ Frontend Client App (Next.js / Vercel Edge Cache)       │
│                                                         │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │ Normalize + cluster  │   │ IndexedDB cache (SWR,  │  │
│  │ map (lib/nusmods.ts) │──▶│ 12h TTL) + /public      │  │
│  └──────────────────────┘   │ snapshot fallback       │  │
│  ┌──────────────────────┐   └────────────────────────┘  │
│  │ Browser Geolocation  │ ─── Checks JS clock and flags │
│  │ (cluster distance)   │     room occupancy natively.  │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘

### 3.1 The Client-Side Data Loop

1.  **Fetch:** On load, `lib/nusmods.ts` fetches the current academic year's
    `venueInformation.json` for both semesters in parallel
    (`https://api.nusmods.com/v2/{acadYear}/semesters/{sem}/venueInformation.json`).
2.  **Normalize:** Flattens each venue's per-day `classes`, maps venues to
    faculty clusters via prefix rules (`lib/cluster-rules.ts`), and resolves
    NUSMods' three `weeks` encodings (`number[]`, `{start,end,weeks}`,
    `{start,end,weekInterval}`) into absolute week numbers.
3.  **Cache (stale-while-revalidate):** The normalized dataset is stored in
    IndexedDB with a `fetchedAt` timestamp. Subsequent visits render instantly
    from cache and only refetch when older than the 12h TTL. If the network or
    CORS fails with no cache, the app falls back to the bundled
    `/public/venues_timetable.json` snapshot.
4.  **Cleanup:** A `DATA_SCHEMA_VERSION` purges old caches on bump; an in-app
    "Refresh data / clear cache" control wipes IndexedDB + service-worker caches.

### 3.2 Frontend Edge Computation Architecture
When a student interacts with the application interface:
1.  The client downloads the highly-compressed `venues_timetable.json` exactly once upon initial page load.
2.  **Time Sync Engine:** The frontend hooks into the local Javascript system clock (`Intl.DateTimeFormat("en-SG")`) to read the exact day and current hour timestamp.
3.  **Matrix Match Intersect:** The logic evaluates the current hour against the downloaded venue matrix entirely client-side. There are absolutely no slow server database trips or runtime computing requirements.
4.  **Sorting & Ranking Routine:**
    * If Geolocation coordinates are granted, calculate the Euclidean distance to the pre-mapped center points of major NUS Faculty Clusters.
    * Sort available rooms with the highest priority assigned to locations that match the student's active region and carry the longest remaining vacancy block.

---

## 4. Implementation Step-by-Step Prompt Instructions for AI Agent

When implementing this codebase, ensure you adhere strictly to the following steps:
1.  **Step 1:** Write the automated build node file `scripts/parse_nusmods.py` to ingest the massive API feed and distill it down into the structural `venues_timetable.json` model defined above.
2.  **Step 2:** Generate the configuration file `.github/workflows/daily_sync.yml` to run the collection script on a free public builder node.
3.  **Step 3:** Setup a React/Next.js functional application inside the root path. Configure the Tailwind or basic styling components to use the strict Glassmorphic background and NUS Corporate colors outlined in Section 1.
4.  **Step 4:** Build out the Client-Side clock lookup and fuzzy filtering matching engine, ensuring responsive rendering on mobile viewports without frame-rate stutters.