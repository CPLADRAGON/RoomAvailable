import { NextResponse } from "next/server";
import { head, put } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BLOB_PATHNAME = "reports/latest.json";
const MAX_AGE_MS = 30 * 60 * 1000; // reports are relevant for 30 minutes
const MAX_REPORTS_PER_VENUE = 5;

type ReportStatus = "free" | "occupied" | "locked";
interface Report {
  status: ReportStatus;
  ts: number;
}
type ReportsMap = Record<string, Report[]>;

// Crowd-sourced "is this room actually free?" signal — bridges the gap
// between timetable-inferred availability and reality (locked rooms, ad-hoc
// bookings, etc). Reuses the same Vercel Blob store the data pipeline uses
// (see docs/superpowers/specs/2026-07-04-crowd-reports-design.md) rather than
// requiring a second external service.
async function readReports(): Promise<ReportsMap> {
  try {
    const meta = await head(BLOB_PATHNAME);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as ReportsMap;
  } catch {
    // Blob missing/unreadable (e.g. no reports submitted yet, or Blob not
    // connected) — treat as "no reports" rather than failing the request.
    return {};
  }
}

function pruneReports(map: ReportsMap, now: number): ReportsMap {
  const out: ReportsMap = {};
  for (const [venue, reports] of Object.entries(map)) {
    const fresh = reports.filter((r) => now - r.ts < MAX_AGE_MS);
    if (fresh.length > 0) out[venue] = fresh.slice(-MAX_REPORTS_PER_VENUE);
  }
  return out;
}

async function writeReports(map: ReportsMap): Promise<void> {
  await put(BLOB_PATHNAME, JSON.stringify(map), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    // This is a live, frequently-changing crowd signal (unlike the daily
    // venue snapshot) — any positive cache TTL here means a freshly
    // submitted report can be invisible to the very next read for that long.
    // The file is tiny and traffic is low, so we trade a little caching
    // efficiency for read-after-write correctness.
    cacheControlMaxAge: 0,
  });
}

// Physically removes expired reports from Blob storage (not just from a
// single response). GET/POST already filter expired reports out of what they
// *show*, but neither writes the cleaned-up result back — a venue that gets
// one report and is never reported on again would otherwise sit in storage
// indefinitely (harmless at this app's scale, but not actually cleaned up).
// Called from the daily cron (src/app/api/cron/refresh-venues/route.ts) so
// there's a real, scheduled sweep independent of read/write traffic.
export async function sweepExpiredReports(): Promise<{ before: number; after: number }> {
  if (!isBlobConfigured()) return { before: 0, after: 0 };
  const raw = await readReports();
  const before = Object.keys(raw).length;
  const pruned = pruneReports(raw, Date.now());
  const after = Object.keys(pruned).length;
  if (before > 0) await writeReports(pruned);
  return { before, after };
}

// Vercel Blob supports two auth methods: the classic static
// BLOB_READ_WRITE_TOKEN, or newer OIDC-based auth (BLOB_STORE_ID +
// an automatically-injected VERCEL_OIDC_TOKEN at runtime). Dashboard-connected
// stores commonly use the OIDC method now, so BLOB_STORE_ID alone is a valid
// signal that the store is properly connected — VERCEL_OIDC_TOKEN itself is a
// short-lived system variable we shouldn't gate on directly.
function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function GET() {
  const configured = isBlobConfigured();
  const map = configured ? pruneReports(await readReports(), Date.now()) : {};
  return NextResponse.json(
    { reports: map, blobConfigured: configured },
    {
      headers: {
        // Deliberately uncached: this is a live community signal, and any
        // edge caching here can make a report a user just submitted
        // invisible to their own next read for tens of seconds.
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const venue = (body as { venue?: unknown } | null)?.venue;
  const status = (body as { status?: unknown } | null)?.status;
  if (
    typeof venue !== "string" ||
    venue.length === 0 ||
    venue.length > 64 ||
    (status !== "free" && status !== "occupied" && status !== "locked")
  ) {
    return NextResponse.json(
      { error: "Body must be { venue: string, status: 'free'|'occupied'|'locked' }" },
      { status: 400 }
    );
  }

  if (!isBlobConfigured()) {
    // Blob store hasn't been connected in the Vercel dashboard yet (see
    // ROADMAP.md S2.4). Distinguishable from a transient failure so the
    // client can show an honest "not available yet" state instead of
    // repeatedly implying "just retry".
    return NextResponse.json(
      { ok: false, error: "Reports storage is not configured yet.", notConfigured: true },
      { status: 503 }
    );
  }

  const now = Date.now();
  const map = pruneReports(await readReports(), now);
  const list = map[venue] ?? [];
  list.push({ status, ts: now });
  map[venue] = list.slice(-MAX_REPORTS_PER_VENUE);

  try {
    await writeReports(map);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, venue, reports: map[venue] });
}
