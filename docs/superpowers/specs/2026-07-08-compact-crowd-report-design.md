# Compact Crowd-Sourced Room Report — Design

_Date: 2026-07-08 · Status: Implemented (2026-07-08)_

## Context

A GitHub issue reported that the "Report Room Status" feature on the venue
detail page is too prominent: a bordered, full-width card with three large
horizontal buttons ("Free" / "Occupied" / "Locked") sits between the
occupancy status line and the Directions buttons, taking ~90-100px of
vertical space and visually competing with the page's primary purpose
(checking availability, navigating). The issue proposed relocating and/or
compacting it into a lightweight micro-interaction.

Current implementation: `src/components/VenueDetail.tsx` lines ~209-254 (the
"Crowd-sourced ground truth" block), backed by `src/lib/reports.ts`
(`fetchReports`, `submitReport`, `isOnCooldown`, `summarizeReports`) and the
`/api/reports` route (unchanged by this design).

## Decisions (confirmed with user)

1. **Placement:** inline with the existing "Data updated Xm ago" line, near
   the top — not relocated below Directions/near the timetable. This keeps
   the trust-critical timestamp and the correction affordance together as one
   idea, with no added scroll distance.
2. **"Yes" submits a confirming report**, not just a silent dismissal. If the
   badge shows "Vacant" and the user taps "Yes", that submits a `free` report
   — the same crowd-sourced signal a "No → Free" flow would produce for the
   opposite case. This means every glance produces a data point, not just
   disagreements, which is a meaningful improvement over the original
   3-button design (where an accurate status could only ever be silently
   ignored, never confirmed).
3. **"No" expands to only the two *other* statuses**, excluding whatever the
   badge already shows (since the user just said that one's wrong). E.g.
   badge = Vacant → No → offers **Occupied** / **Locked** only.
4. **When reports aren't available** (Blob not configured — see
   `reportsAvailable === false` in current code), hide the entire line
   rather than showing an apologetic placeholder message. Non-intrusive by
   default is the whole point of this redesign.

## Status → report-value mapping

`computeOccupancy` returns `"vacant" | "occupied" | "crunch"`; report values
are `"free" | "occupied" | "locked"`. Mapping for the "Yes" confirm action and
for excluding the current status from the "No" expansion:

```
vacant           -> "free"
occupied         -> "occupied"
crunch           -> "occupied"   (crunch is a display variant of occupied)
```

A small helper, e.g. `currentReportValue(status): ReportStatus`, encapsulates
this so the mapping lives in one place.

## Layout & copy (replaces lines ~209-254 in VenueDetail.tsx)

Removed entirely: the bordered `<div className="... rounded-lg border ...">`
card and its 3-button full-width row.

New structure, inserted directly after the existing "Data updated" line
(same flex-wrap row it's already in, or the line immediately below it —
implementation detail, see Todos):

```
[● VACANT]  Data updated 14m ago
2 students reported this Occupied 5m ago      <- only if reportSummary exists
Is this correct?  Yes   No                     <- default state
```

**States** (all plain small text, no borders/cards — matches the existing
"Data updated"/"No classes on record" muted-text visual language):

| State | Line 3 content |
|---|---|
| Default (not yet answered this session) | `Is this correct?` + `Yes` / `No` as small text-buttons |
| Cooldown active from an earlier submission this session (`isOnCooldown`, but `justSubmitted` is false because the venue detail was closed and reopened) | Shown disabled/dimmed with a small note, e.g. `Is this correct?` `Yes` `No` greyed out — same "already reported recently" affordance as today, just visually lighter (no bordered card) |
| Tapped "Yes", submitting | brief inline "…" on the Yes button, matches existing `submitting` pattern |
| Tapped "Yes", success (`justSubmitted` true) | `Thanks for confirming!` (green, small) — persists until the venue detail is closed, same as today |
| Tapped "No" | Line 3 becomes the two non-current statuses as small text-buttons, e.g. `Occupied` `Locked` |
| Tapped a "No"-expanded option, success (`justSubmitted` true) | `Thanks for reporting!` (green, small) — persists until the venue detail is closed, same as today |
| Submit fails (either path) | existing amber "Couldn't submit... try again in a moment" message, same as today, on its own line |
| `reportsAvailable === false` | Line 3 (and the summary line, and the whole block) is not rendered at all |

`justSubmitted` state (already exists) continues to gate the "Thanks..."
message; reused as-is. `submitError` (already exists) continues to gate the
error message; reused as-is. `onCooldown` (already exists, backed by
`isOnCooldown`/localStorage) continues to disable the Yes/No (or expanded)
buttons rather than hiding them — matches today's disabled-button behavior,
just without the bordered-card visual weight.

## Data flow — no backend changes

`src/lib/reports.ts` and `/api/reports` are unchanged. The only new piece of
client logic is the status→report-value mapping helper and updating
`handleReport`'s call sites to pass either the mapped "confirm" value (Yes)
or a specific "correction" value chosen from the two-button expansion (No).
`submitReport(venue, status)` already accepts any `ReportStatus`, so no
signature changes are needed.

## Testing / verification plan

- `npm run build`.
- Playwright against local dev:
  - Confirm the old bordered card/3-button row no longer renders.
  - Confirm "Is this correct? Yes / No" appears inline near "Data updated".
  - Tap "Yes" on a vacant room → confirm a `free` report is submitted (mock
    the API) and "Thanks for confirming!" shows.
  - Tap "No" on a vacant room → confirm only "Occupied" and "Locked" render
    (not "Free"); tap one → confirm submission + "Thanks for reporting!".
  - Confirm the whole block is absent when `reportsAvailable` is false
    (mock the API response).
  - Confirm cooldown still suppresses repeat prompts within the existing
    2-minute window (`isOnCooldown`/`setCooldown`, unchanged).
- Visual check: total vertical footprint of the new inline treatment vs. the
  removed card, to confirm the "large footprint" complaint is resolved.
