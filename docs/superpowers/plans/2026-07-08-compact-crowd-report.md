# Compact Crowd-Sourced Room Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bordered, full-width "Report Room Status" card (3 large buttons) on the venue detail page with a compact inline "Is this correct? Yes / No" micro-interaction anchored to the existing "Data updated" timestamp line.

**Architecture:** Single-component change in `src/components/VenueDetail.tsx`, plus one small pure-mapping helper added to `src/lib/reports.ts`. No backend/API/type changes. Reuses the existing `submitReport`/`fetchReports`/`isOnCooldown`/`summarizeReports` functions and the existing `justSubmitted`/`submitError`/`onCooldown`/`reportsAvailable` state machine — only the layout and the Yes/No branching logic are new.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind CSS. No test framework is installed in this project (verified: no jest/vitest/playwright config committed) — verification is via `npm run build` (type-checking) plus an ad-hoc Playwright script run against the local dev server, matching the verification pattern already used throughout this project's history. No new testing infrastructure is introduced.

---

## Reference: design spec

Full design detail, decisions, and rationale: `docs/superpowers/specs/2026-07-08-compact-crowd-report-design.md`. Read it before starting if anything below is unclear.

## Reference: current code being replaced

`src/components/VenueDetail.tsx` currently contains (approximately lines 209-254) a block starting with the comment `{/* Crowd-sourced ground truth */}` — a `<div className="mb-4 rounded-lg border border-zinc-200/70 bg-white/50 p-3">` wrapping the report summary line and either the unavailable message, the "Thanks for confirming!" message, or a `<p>` + 3-button `<div className="flex gap-2">` row (Free / Occupied / Locked). This entire block is replaced by Task 2 below.

---

### Task 1: Add `currentReportValue` mapping helper

**Files:**
- Modify: `src/lib/reports.ts`

- [ ] **Step 1: Add the import and helper function**

Open `src/lib/reports.ts`. At the top of the file, add an import for `OccupancyStatus`:

```typescript
import type { OccupancyStatus } from "@/types";
```

Then add this exported function anywhere after the existing type definitions (e.g. directly after the `Report`/`ReportsMap` interfaces, before `fetchReports`):

```typescript
// Maps a computed occupancy status to the report value a "Yes, this is
// correct" confirmation should submit, and that a "No, it's wrong"
// correction should exclude from its two alternative options. `crunch` is a
// display variant of `occupied` (same underlying meaning, different visual
// treatment), so it maps to the same report value.
export function currentReportValue(status: OccupancyStatus): ReportStatus {
  return status === "vacant" ? "free" : "occupied";
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"; npx tsc --noEmit`

Expected: no new errors related to `src/lib/reports.ts`. (The project has pre-existing files; only check that this file doesn't introduce errors — the full `npm run build` in Task 3 is the authoritative check.)

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
git add src/lib/reports.ts
git commit -m "feat: add currentReportValue mapping helper for compact report UI"
```

---

### Task 2: Replace the bordered card with the compact inline Yes/No interaction

**Files:**
- Modify: `src/components/VenueDetail.tsx`

- [ ] **Step 1: Update imports**

Find this import block near the top of the file:

```typescript
import {
  fetchReports,
  submitReport,
  isOnCooldown,
  summarizeReports,
  type Report,
  type ReportStatus,
} from "@/lib/reports";
```

Replace it with:

```typescript
import {
  fetchReports,
  submitReport,
  isOnCooldown,
  summarizeReports,
  currentReportValue,
  type Report,
  type ReportStatus,
} from "@/lib/reports";
```

- [ ] **Step 2: Add new state and reset it alongside the existing per-venue reset**

Find this state block:

```typescript
  const [showMap, setShowMap] = useState(false);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [reportsAvailable, setReportsAvailable] = useState<boolean | null>(null); // null = still checking
  const [submitting, setSubmitting] = useState<ReportStatus | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [onCooldown, setOnCooldown] = useState(false);
```

Replace it with (two new state variables added at the end):

```typescript
  const [showMap, setShowMap] = useState(false);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [reportsAvailable, setReportsAvailable] = useState<boolean | null>(null); // null = still checking
  const [submitting, setSubmitting] = useState<ReportStatus | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [onCooldown, setOnCooldown] = useState(false);
  // True after tapping "No" — the line has expanded to show the two
  // alternative statuses instead of the Yes/No prompt.
  const [showAlternatives, setShowAlternatives] = useState(false);
  // Which flow produced the current "Thanks..." message, so the copy can
  // differ between confirming ("Yes") and correcting ("No" -> alternative).
  const [lastAction, setLastAction] = useState<"confirm" | "correct" | null>(null);
```

Find the `useEffect` that resets state per-venue:

```typescript
  useEffect(() => {
    let cancelled = false;
    setReports(null);
    setJustSubmitted(false);
    setSubmitError(false);
    setReportsAvailable(null);
    setOnCooldown(isOnCooldown(venue));
    fetchReports().then(({ reports: map, available }) => {
      if (cancelled) return;
      setReports(map[venue] ?? []);
      setReportsAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, [venue]);
```

Replace it with (two new resets added):

```typescript
  useEffect(() => {
    let cancelled = false;
    setReports(null);
    setJustSubmitted(false);
    setSubmitError(false);
    setReportsAvailable(null);
    setShowAlternatives(false);
    setLastAction(null);
    setOnCooldown(isOnCooldown(venue));
    fetchReports().then(({ reports: map, available }) => {
      if (cancelled) return;
      setReports(map[venue] ?? []);
      setReportsAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, [venue]);
```

- [ ] **Step 3: Update `handleReport` to accept an action label, and add the `mappedCurrent`/`alternatives` derived values**

Find:

```typescript
  const reportSummary = useMemo(() => summarizeReports(reports ?? undefined), [reports]);

  const handleReport = async (status: ReportStatus) => {
    setSubmitting(status);
    setSubmitError(false);
    const ok = await submitReport(venue, status);
    setSubmitting(null);
    if (ok) {
      setJustSubmitted(true);
      setOnCooldown(true);
      // Optimistically reflect the new report locally instead of waiting on a
      // refetch — Vercel Blob's CDN can take a few seconds to propagate a
      // brand-new write, so re-fetching immediately could still show stale
      // (empty) data even though the submission succeeded.
      setReports((prev) => [...(prev ?? []), { status, ts: Date.now() }]);
    } else {
      setSubmitError(true);
    }
  };
```

Replace it with:

```typescript
  const reportSummary = useMemo(() => summarizeReports(reports ?? undefined), [reports]);

  // The report value that matches the currently-displayed status (what a
  // "Yes" tap confirms), and the two remaining values a "No" tap can pick
  // from (see docs/superpowers/specs/2026-07-08-compact-crowd-report-design.md).
  const mappedCurrent = useMemo(
    () => currentReportValue(occupancy.status),
    [occupancy.status]
  );
  const alternatives = useMemo(
    () => (["free", "occupied", "locked"] as const).filter((s) => s !== mappedCurrent),
    [mappedCurrent]
  );

  const handleReport = async (status: ReportStatus, action: "confirm" | "correct") => {
    setSubmitting(status);
    setSubmitError(false);
    const ok = await submitReport(venue, status);
    setSubmitting(null);
    if (ok) {
      setJustSubmitted(true);
      setLastAction(action);
      setOnCooldown(true);
      // Optimistically reflect the new report locally instead of waiting on a
      // refetch — Vercel Blob's CDN can take a few seconds to propagate a
      // brand-new write, so re-fetching immediately could still show stale
      // (empty) data even though the submission succeeded.
      setReports((prev) => [...(prev ?? []), { status, ts: Date.now() }]);
    } else {
      setSubmitError(true);
    }
  };
```

- [ ] **Step 4: Replace the bordered card JSX**

Find this entire block (the comment through the closing `</div>` right before the `{/* Directions */}` comment):

```typescript
        {/* Crowd-sourced ground truth */}
        <div className="mb-4 rounded-lg border border-zinc-200/70 bg-white/50 p-3">
          {reportSummary && (
            <p className="mb-2 text-xs text-zinc-500">
              {reportSummary.count} student{reportSummary.count > 1 ? "s" : ""}{" "}
              reported this{" "}
              <span className="font-medium text-zinc-700">
                {REPORT_LABEL[reportSummary.status]}
              </span>{" "}
              {formatRelativeTime(reportSummary.latestTs, now)}
            </p>
          )}
          {reportsAvailable === false ? (
            <p className="text-xs text-zinc-400">
              Community reports aren't available yet — check back soon.
            </p>
          ) : justSubmitted ? (
            <p className="text-xs font-medium text-emerald-600">
              Thanks for confirming! This helps other students.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-zinc-600">
                Is this room actually free?
              </p>
              <div className="flex gap-2">
                {(["free", "occupied", "locked"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleReport(s)}
                    disabled={submitting !== null || onCooldown || reportsAvailable === null}
                    className="flex-1 rounded-lg border border-zinc-200 bg-white/70 px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-nus-blue hover:text-nus-blue disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting === s ? "…" : REPORT_LABEL[s]}
                  </button>
                ))}
              </div>
              {submitError && (
                <p className="mt-2 text-[11px] text-amber-600">
                  Couldn't submit your report right now — please try again in
                  a moment.
                </p>
              )}
            </>
          )}
        </div>
```

Replace it with:

```typescript
        {/* Crowd-sourced ground truth — compact, inline with the timestamp
            rather than a separate bordered card. Hidden entirely (not just
            disabled) when reports aren't configured, so there's zero
            footprint when the feature isn't actually usable. See
            docs/superpowers/specs/2026-07-08-compact-crowd-report-design.md */}
        {reportsAvailable !== false && (
          <div className="mb-4 space-y-1">
            {reportSummary && (
              <p className="text-xs text-zinc-500">
                {reportSummary.count} student{reportSummary.count > 1 ? "s" : ""}{" "}
                reported this{" "}
                <span className="font-medium text-zinc-700">
                  {REPORT_LABEL[reportSummary.status]}
                </span>{" "}
                {formatRelativeTime(reportSummary.latestTs, now)}
              </p>
            )}
            {justSubmitted ? (
              <p className="text-xs font-medium text-emerald-600">
                {lastAction === "confirm"
                  ? "Thanks for confirming!"
                  : "Thanks for reporting!"}
              </p>
            ) : showAlternatives ? (
              <p className="text-xs text-zinc-500">
                What's the actual status?{" "}
                {alternatives.map((alt, i) => (
                  <span key={alt}>
                    {i > 0 && " · "}
                    <button
                      onClick={() => handleReport(alt, "correct")}
                      disabled={submitting !== null}
                      className="font-medium text-nus-blue underline underline-offset-2 hover:text-nus-blue/80 disabled:opacity-40"
                    >
                      {submitting === alt ? "…" : REPORT_LABEL[alt]}
                    </button>
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Is this correct?{" "}
                <button
                  onClick={() => handleReport(mappedCurrent, "confirm")}
                  disabled={submitting !== null || onCooldown || reportsAvailable === null}
                  className="font-medium text-nus-blue underline underline-offset-2 hover:text-nus-blue/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting === mappedCurrent ? "…" : "Yes"}
                </button>{" "}
                ·{" "}
                <button
                  onClick={() => setShowAlternatives(true)}
                  disabled={submitting !== null || onCooldown || reportsAvailable === null}
                  className="font-medium text-nus-blue underline underline-offset-2 hover:text-nus-blue/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  No
                </button>
              </p>
            )}
            {submitError && (
              <p className="text-[11px] text-amber-600">
                Couldn't submit your report right now — please try again in a
                moment.
              </p>
            )}
          </div>
        )}
```

Note: `onCooldown` continues to disable the Yes/No buttons (they remain visible but greyed out) rather than hiding the whole line — this matches the existing disabled-button behavior, just without the bordered-card visual weight, per the design spec's cooldown row.

- [ ] **Step 5: Commit**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
git add src/components/VenueDetail.tsx
git commit -m "feat: compact inline Yes/No crowd report UI, replacing the bordered card"
```

---

### Task 3: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Clean build**

Run:
```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
```

Expected: `✓ Compiled successfully`, `Finished TypeScript` with no errors, and the route list still shows `/api/cron/refresh-venues`, `/api/reports`, `/api/venues` as dynamic and `/` as static. No new warnings referencing `VenueDetail.tsx` or `reports.ts`.

If it fails: read the TypeScript error carefully — the most likely mistake is a mismatched type between `alternatives` (typed as `readonly ("free" | "occupied" | "locked")[]` from the `as const` filter) and the `ReportStatus` type expected by `handleReport`/`REPORT_LABEL`. Fix by ensuring `alternatives.map((alt) => ...)` treats `alt` as `ReportStatus` — TypeScript should infer this correctly from the `.filter()` on the `as const` tuple; if it doesn't, cast explicitly: `(alt as ReportStatus)`.

---

### Task 4: Playwright verification of all states

No test framework is installed in this project — this is an ad-hoc verification script run against the local dev server (not a committed test file), matching how every other feature in this project has been verified.

**Files:** none (temporary script only, not committed)

- [ ] **Step 1: Start the dev server**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:PORT="3150"
npm run dev
```

Wait for `✓ Ready` before proceeding. Leave this running in the background for the remaining steps.

- [ ] **Step 2: Verify the old bordered card is gone and the new inline prompt renders**

Run this against the dev server (adjust venue selection to any real venue in the data — use the "All venues" browse list and open the first card):

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:NODE_PATH=(Resolve-Path .\node_modules)
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3150', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.locator('button:has-text(\"All venues\")').first().click();
  await p.waitForTimeout(800);
  await p.locator('button.glass').first().click();
  await p.waitForTimeout(1200);
  const bodyText = await p.textContent('body');
  console.log('Old bordered card gone:', !/Is this room actually free\?/i.test(bodyText));
  console.log('New inline prompt present:', /Is this correct\?/i.test(bodyText));
  console.log('Yes button present:', await p.locator('button:has-text(\"Yes\")').count() > 0);
  console.log('No button present:', await p.locator('button:has-text(\"No\")').count() > 0);
  console.log('Console/page errors:', errs.length);
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

Expected output: all four booleans `true`, `Console/page errors: 0`.

- [ ] **Step 3: Verify "Yes" submits a confirming report**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:NODE_PATH=(Resolve-Path .\node_modules)
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage();
  let posted = null;
  await p.route('**/api/reports', async route => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: {}, blobConfigured: true }) });
    } else {
      posted = JSON.parse(route.request().postData());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await p.goto('http://localhost:3150', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.locator('button:has-text(\"All venues\")').first().click();
  await p.waitForTimeout(800);
  const card = p.locator('button.glass').first();
  await card.click();
  await p.waitForTimeout(1200);
  const isVacant = /VACANT/i.test(await p.textContent('body'));
  console.log('Venue shown as vacant:', isVacant);
  await p.locator('button:has-text(\"Yes\")').first().click();
  await p.waitForTimeout(1000);
  console.log('Posted report status:', posted && posted.status, \"(expect 'free' if vacant, 'occupied' otherwise)\");
  console.log('Shows Thanks for confirming:', /Thanks for confirming!/i.test(await p.textContent('body')));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

Expected: `posted.status` is `"free"` when the venue is vacant (or `"occupied"` if it happened to be occupied/crunch), and the "Thanks for confirming!" message appears.

- [ ] **Step 4: Verify "No" expands to the two alternative statuses only**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:NODE_PATH=(Resolve-Path .\node_modules)
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage();
  let posted = null;
  await p.route('**/api/reports', async route => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: {}, blobConfigured: true }) });
    } else {
      posted = JSON.parse(route.request().postData());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await p.goto('http://localhost:3150', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.locator('button:has-text(\"All venues\")').first().click();
  await p.waitForTimeout(800);
  await p.locator('button.glass').first().click();
  await p.waitForTimeout(1200);
  const isVacant = /VACANT/i.test(await p.textContent('body'));
  console.log('Venue shown as vacant:', isVacant);
  await p.locator('button:has-text(\"No\")').first().click();
  await p.waitForTimeout(500);
  const bodyAfterNo = await p.textContent('body');
  console.log('Shows What is the actual status:', /What's the actual status\?/i.test(bodyAfterNo));
  const altBtn = p.locator('button:has-text(\"Occupied\")').last();
  if (await altBtn.count() > 0) {
    await altBtn.click();
    await p.waitForTimeout(1000);
    console.log('Posted report status:', posted && posted.status, \"(expect 'occupied')\");
    console.log('Shows Thanks for reporting:', /Thanks for reporting!/i.test(await p.textContent('body')));
  }
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

Expected: `"What's the actual status?"` appears after tapping "No"; tapping "Occupied" posts `{status: "occupied"}` and shows "Thanks for reporting!". If the venue shown was vacant, manually confirm from the printed HTML/screenshot (Step 6) that "Free" was not one of the offered alternative buttons.

- [ ] **Step 5: Verify the whole block is hidden when reports aren't available**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:NODE_PATH=(Resolve-Path .\node_modules)
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/api/reports', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: {}, blobConfigured: false }) });
    } else {
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    }
  });
  await p.goto('http://localhost:3150', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.locator('button:has-text(\"All venues\")').first().click();
  await p.waitForTimeout(800);
  await p.locator('button.glass').first().click();
  await p.waitForTimeout(1200);
  const bodyText = await p.textContent('body');
  console.log('No Is this correct prompt shown:', !/Is this correct\?/i.test(bodyText));
  console.log('No not-available message shown either (fully hidden):', !/aren't available yet/i.test(bodyText));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

Expected: both booleans `true` — the block renders nothing at all when reports aren't configured.

- [ ] **Step 6: Visual footprint check**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
$env:NODE_PATH=(Resolve-Path .\node_modules)
node -e "
const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 800 } });
  await p.goto('http://localhost:3150', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.locator('button:has-text(\"All venues\")').first().click();
  await p.waitForTimeout(800);
  await p.locator('button.glass').first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'verify-compact-report.png' });
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

Then view `verify-compact-report.png` (e.g. with the `view` tool) — confirm the report section reads as 1-3 short lines directly under "Data updated", not a bordered card, and confirm the overall modal reads with availability/navigation as the visual focus. Delete the screenshot afterward (`Remove-Item verify-compact-report.png`).

- [ ] **Step 7: Stop the dev server**

Stop the background dev server process started in Step 1.

---

### Task 5: Update the design spec's status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-compact-crowd-report-design.md`

- [ ] **Step 1: Mark the spec as implemented**

Change the status line at the top of the file from:

```markdown
_Date: 2026-07-08 · Status: Approved by user_
```

to:

```markdown
_Date: 2026-07-08 · Status: Implemented (2026-07-08)_
```

- [ ] **Step 2: Commit and push everything**

```powershell
cd "C:\Users\wangbo\Desktop\Work\Personal Repo\RoomAvailable"
git add docs/superpowers/specs/2026-07-08-compact-crowd-report-design.md
git commit -m "docs: mark compact crowd-report spec as implemented"
git push
```

Confirm with `git log --oneline -5` and `git status --short` (only the pre-existing unrelated untracked file should remain, as throughout this project's history).
