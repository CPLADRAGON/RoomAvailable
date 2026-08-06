import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { fetchVenueData } from "@/lib/nusmods";
import type { VenueMatrix } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BLOB_PATHNAME = "venues/latest.json";

// Serves the compacted venue snapshot maintained by the daily cron
// (src/app/api/cron/refresh-venues). Edge-cached so the vast majority of
// visitors never reach this function at all — Vercel's CDN absorbs repeat
// requests for up to an hour, serving stale for up to a day while
// revalidating in the background.
//
// Cold-start / Blob-unavailable fallback: if the Blob snapshot doesn't exist
// yet (first deploy, before the first cron tick) or Blob reads fail for any
// reason, fetch live from NUSMods directly (the same isomorphic function the
// browser used to call per-user) and best-effort persist it to Blob so the
// next request is fast. This must never be the reason venues fail to load.
export async function GET() {
  try {
    const meta = await head(BLOB_PATHNAME);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Blob fetch HTTP ${res.status}`);
    const matrix = (await res.json()) as VenueMatrix;

    return NextResponse.json(matrix, {
      headers: {
        // NOTE (verified live 2026-07-07): Vercel's edge normalizes the
        // client-visible Cache-Control header down to just "public" on cache
        // hits — it does not echo s-maxage/stale-while-revalidate back to the
        // browser — but it DOES honor these directives internally for its own
        // edge caching decisions. Confirmed via a real production request
        // showing `x-vercel-cache: HIT` and `age: 576` (within the 1h
        // s-maxage window). This is expected CDN behavior, not a bug — do not
        // "fix" this by trying to force the raw header through.
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // Blob missing or unreadable — cold-start fallback: fetch live and
    // opportunistically warm the Blob for next time (best-effort; failures
    // here must not affect the response to this request).
    try {
      const matrix = await fetchVenueData();
      warmBlob(matrix);
      return NextResponse.json(matrix, {
        headers: {
          // Short TTL: this is a live, unbatched fetch — don't let the CDN
          // hold onto it as long as the normal cron-refreshed snapshot.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Failed to load venue data" },
        { status: 502 }
      );
    }
  }
}

function warmBlob(matrix: VenueMatrix): void {
  import("@vercel/blob")
    .then(({ put }) =>
      put(BLOB_PATHNAME, JSON.stringify(matrix), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      })
    )
    .catch(() => {
      /* best-effort warm; the cron job will retry tomorrow regardless */
    });
}
