import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { fetchVenueData } from "@/lib/nusmods";
import { sweepExpiredReports } from "@/app/api/reports/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fixed, non-random pathname so repeated writes overwrite in place and the
// public download URL stays stable across runs.
const BLOB_PATHNAME = "venues/latest.json";

// Triggered daily by Vercel Cron (see vercel.json). Re-fetches + normalizes
// both regular semesters and both special terms from NUSMods (reusing the
// exact same isomorphic logic the client used to run per-user), then writes
// the compacted result to Vercel Blob so every visitor can fetch a small,
// edge-cached snapshot from our own /api/venues route instead of hitting
// NUSMods/GitHub directly. See docs/superpowers/specs/2026-07-03-data-pipeline-design.md.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const matrix = await fetchVenueData();
    const json = JSON.stringify(matrix);

    await put(BLOB_PATHNAME, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60, // minimum allowed; freshness is controlled by /api/venues, not the blob itself
    });

    // Also physically sweep expired crowd-sourced reports from Blob storage
    // on this same daily schedule (see src/app/api/reports/route.ts). Reads
    // already hide expired reports from users; this makes sure the storage
    // itself doesn't quietly accumulate stale entries for venues that never
    // get reported on again. Best-effort — a sweep failure shouldn't fail the
    // venue-data refresh this route primarily exists for.
    const sweep = await sweepExpiredReports().catch(() => null);

    return NextResponse.json({
      ok: true,
      generated_at: matrix._meta.generated_at,
      venue_count: matrix._meta.venue_count,
      bytes: json.length,
      reportsSwept: sweep,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
