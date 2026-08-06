"use client";

import type { OccupancyStatus } from "@/types";

export type ReportStatus = "free" | "occupied" | "locked";

export interface Report {
  status: ReportStatus;
  ts: number;
}

export type ReportsMap = Record<string, Report[]>;

export interface FetchReportsResult {
  reports: ReportsMap;
  // False when the backing Blob store hasn't been connected in the Vercel
  // dashboard yet (see ROADMAP.md S2.4) or the request failed outright.
  // Lets the UI show an honest "not available yet" state instead of
  // interactive-looking buttons that would silently fail on every tap.
  available: boolean;
}

const COOLDOWN_KEY_PREFIX = "vacansee_report_cooldown_";
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes per venue, per browser

const LOCAL_REPORT_KEY_PREFIX = "vacansee_report_local_";
const LOCAL_REPORT_TTL_MS = 10 * 60 * 1000; // 10 minutes — just needs to
// outlast any residual server-side propagation delay, not act as a lasting
// cache; the Blob store remains the single source of truth for everyone else.

// Fetch all venues' recent (< 30 min old) community reports in one call.
// Small; safe to call once per venue-detail open.
export async function fetchReports(): Promise<FetchReportsResult> {
  try {
    const res = await fetch("/api/reports", { cache: "no-store" });
    if (!res.ok) return { reports: {}, available: false };
    const data = (await res.json()) as {
      reports?: ReportsMap;
      blobConfigured?: boolean;
    };
    return {
      reports: data.reports ?? {},
      available: Boolean(data.blobConfigured),
    };
  } catch {
    return { reports: {}, available: false };
  }
}

// Submit a one-tap "is this room actually free?" report for a venue.
export async function submitReport(
  venue: string,
  status: ReportStatus
): Promise<boolean> {
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue, status }),
    });
    if (res.ok) {
      setCooldown(venue);
      cacheLocalReport(venue, status, Date.now());
    }
    return res.ok;
  } catch {
    return false;
  }
}

// Lightweight, client-only anti-spam deterrent (not a security control): once
// a report is submitted for a venue, disable the buttons for that venue in
// this browser for a short cooldown window.
function setCooldown(venue: string): void {
  try {
    localStorage.setItem(COOLDOWN_KEY_PREFIX + venue, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function isOnCooldown(venue: string): boolean {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY_PREFIX + venue);
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

// Safety net for the read-after-write gap: even with caching minimized (see
// src/app/api/reports/route.ts), a fresh report can still take a moment to
// show up in a subsequent GET. Remembering the user's own submission locally
// means reopening the venue detail always reflects it immediately, without
// waiting on — or trusting — the server round-trip.
function cacheLocalReport(venue: string, status: ReportStatus, ts: number): void {
  try {
    localStorage.setItem(
      LOCAL_REPORT_KEY_PREFIX + venue,
      JSON.stringify({ status, ts })
    );
  } catch {
    /* ignore */
  }
}

export function getLocalReport(venue: string): Report | null {
  try {
    const raw = localStorage.getItem(LOCAL_REPORT_KEY_PREFIX + venue);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Report;
    if (Date.now() - parsed.ts > LOCAL_REPORT_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Maps a computed occupancy status to the report value a "Yes, this is
// correct" confirmation should submit, and that a "No, it's wrong"
// correction should exclude from its two alternative options. `crunch` is a
// display variant of `occupied` (same underlying meaning, different visual
// treatment), so it maps to the same report value.
export function currentReportValue(status: OccupancyStatus): ReportStatus {
  return status === "vacant" ? "free" : "occupied";
}

// Most-recent report summary for a venue, for a compact "N students reported
// X Y min ago" line. Returns null if there are no fresh reports.
export function summarizeReports(
  reports: Report[] | undefined
): { status: ReportStatus; count: number; latestTs: number } | null {
  if (!reports || reports.length === 0) return null;
  const latest = reports[reports.length - 1];
  const matching = reports.filter((r) => r.status === latest.status);
  return { status: latest.status, count: matching.length, latestTs: latest.ts };
}
