"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { VenueEntry, CalendarEntry } from "@/types";
import { useModalA11y } from "@/hooks/useModalA11y";
import { computeOccupancy, formatTime, formatRelativeTime } from "@/lib/occupancy-engine";
import { getDestination, mapsUrl } from "@/lib/directions";
import {
  fetchReports,
  submitReport,
  isOnCooldown,
  summarizeReports,
  currentReportValue,
  getLocalReport,
  type Report,
  type ReportStatus,
} from "@/lib/reports";
import StatusBadge from "./StatusBadge";
import WeekGrid from "./WeekGrid";

const VenueMiniMap = dynamic(() => import("./VenueMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-zinc-200/70 text-xs text-zinc-400">
      Loading map…
    </div>
  ),
});

const REPORT_LABEL: Record<ReportStatus, string> = {
  free: "Free",
  occupied: "Occupied",
  locked: "Locked",
};

interface Props {
  venue: string;
  entry: VenueEntry;
  now: Date;
  semester: CalendarEntry | null;
  lastUpdated: number | null;
  isFavorite?: boolean;
  onToggleFavorite?: (venue: string) => void;
  onClose: () => void;
}

export default function VenueDetail({
  venue,
  entry,
  now,
  semester,
  lastUpdated,
  isFavorite,
  onToggleFavorite,
  onClose,
}: Props) {
  const occupancy = useMemo(
    () => computeOccupancy(entry, now, semester),
    [entry, now, semester]
  );
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
  const [linkCopied, setLinkCopied] = useState(false);

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
      let venueReports = map[venue] ?? [];
      // Bridge any residual read-after-write delay: if we locally remember
      // submitting a report that the server round-trip doesn't (yet) show,
      // merge it in so the summary reflects it immediately instead of
      // appearing to have been lost.
      const local = getLocalReport(venue);
      if (
        local &&
        !venueReports.some(
          (r) => r.status === local.status && Math.abs(r.ts - local.ts) < 5000
        )
      ) {
        venueReports = [...venueReports, local];
      }
      setReports(venueReports);
      setReportsAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, [venue]);

  // Lock background page scroll while the detail modal is open, so scrolling
  // the sheet to its end can't chain-scroll the page behind it (the modal
  // only renders while a venue is selected, so mount/unmount == open/close).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  const hasCoords =
    typeof entry.lat === "number" && typeof entry.lng === "number";

  const dest = getDestination(venue, entry);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/?venue=${encodeURIComponent(venue)}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${venue} room details`}
        tabIndex={-1}
        className="glass w-full max-w-lg rounded-t-2xl sm:max-w-2xl sm:rounded-2xl lg:max-w-4xl max-h-[85vh] overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bottom-sheet drag affordance (phone only) */}
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300/80 sm:hidden" />
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-[-0.02em] text-nus-blue">
              {venue}
            </h2>
            {entry.roomName && (
              <p className="text-sm text-zinc-600">{entry.roomName}</p>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
              <span>{entry.cluster}</span>
              {entry.type && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="font-medium text-nus-blue">{entry.type}</span>
                </>
              )}
              {entry.capacity ? (
                <>
                  <span className="text-zinc-300">·</span>
                  <span>~{entry.capacity} seats</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyLink}
              aria-label={linkCopied ? "Link copied" : "Copy link to this room"}
              className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-nus-blue"
            >
              {linkCopied ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M20 6L9 17l-5-5" stroke="#0e9f6e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 15l6-6M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(venue)}
                aria-label={isFavorite ? "Remove from saved" : "Save room"}
                aria-pressed={isFavorite}
                className="rounded-full p-1 transition-transform active:scale-90"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill={isFavorite ? "#EF7C00" : "none"}
                  stroke={isFavorite ? "#EF7C00" : "#A1A1AA"}
                  strokeWidth="2"
                  strokeLinejoin="round"
                >
                  <path d="M12 17.3l-5.4 3.1 1.4-6.1-4.7-4.1 6.2-.5L12 4l2.5 5.7 6.2.5-4.7 4.1 1.4 6.1z" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current status */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge info={occupancy} />
          {lastUpdated && (
            <span className="text-[11px] text-zinc-400">
              Data updated {formatRelativeTime(lastUpdated, now)}
            </span>
          )}
        </div>
        {occupancy.status === "vacant" && occupancy.hasScheduleToday === false && (
          <p className="mb-2 text-[11px] text-zinc-400">
            No classes on record for this room today — please verify on site.
          </p>
        )}
        {occupancy.status === "vacant" && occupancy.nextClass && (
          <p className="mb-4 text-sm text-zinc-500">
            Next class: {occupancy.nextClass.module} at{" "}
            {formatTime(occupancy.nextClass.start)}
          </p>
        )}
        {occupancy.status !== "vacant" && occupancy.until && (
          <p className="mb-4 text-sm text-zinc-500">
            {occupancy.currentModule}
            {occupancy.currentClass ? ` · ${occupancy.currentClass}` : ""} · ends{" "}
            {formatTime(occupancy.until)}
            {occupancy.freeAt && (
              <span className="text-emerald-600">
                {" "}
                · free from {formatTime(occupancy.freeAt)}
              </span>
            )}
          </p>
        )}

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
                What&apos;s the actual status?{" "}
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

        {/* Directions */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <a
            href={mapsUrl(dest)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-nus-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-nus-blue/90 active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 21s-7-6.5-7-11a7 7 0 1114 0c0 4.5-7 11-7 11z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            Directions
          </a>
          {hasCoords && (
            <button
              onClick={() => setShowMap((s) => !s)}
              aria-expanded={showMap}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nus-blue/40 px-3 py-2 text-sm font-medium text-nus-blue transition-colors hover:bg-nus-blue/5"
            >
              {showMap ? "Hide location" : "Show location"}
            </button>
          )}
          <span className="text-xs text-zinc-400">{dest.label}</span>
        </div>

        {hasCoords && showMap && (
          <div className="mb-4">
            <VenueMiniMap
              lat={entry.lat as number}
              lng={entry.lng as number}
              label={venue}
            />
          </div>
        )}

        {/* Weekly timetable */}
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Weekly Timetable
        </h3>
        <p className="mb-3 text-[11px] text-zinc-400">
          Solid = booked this week · outline = scheduled another week · empty =
          free. Tap a class for details.
        </p>

        <WeekGrid entry={entry} now={now} semester={semester} />
      </div>
    </div>
  );
}
