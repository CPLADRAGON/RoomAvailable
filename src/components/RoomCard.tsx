"use client";

import { useMemo } from "react";
import type { VenueEntry, CalendarEntry } from "@/types";
import { computeOccupancy, formatTime, formatDuration } from "@/lib/occupancy-engine";
import { haversineMeters, formatDistance, walkMinutes } from "@/lib/geo";
import StatusBadge from "./StatusBadge";

interface Props {
  venue: string;
  entry: VenueEntry;
  now: Date;
  semester: CalendarEntry | null;
  userLoc: { lat: number; lng: number } | null;
  isFavorite?: boolean;
  onToggleFavorite?: (venue: string) => void;
  onSelect: (venue: string, entry: VenueEntry) => void;
}

export default function RoomCard({
  venue,
  entry,
  now,
  semester,
  userLoc,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: Props) {
  const occupancy = useMemo(
    () => computeOccupancy(entry, now, semester),
    [entry, now, semester]
  );

  const isOccupied = occupancy.status === "occupied" || occupancy.status === "crunch";

  const distM =
    userLoc && typeof entry.lat === "number" && typeof entry.lng === "number"
      ? haversineMeters(userLoc.lat, userLoc.lng, entry.lat, entry.lng)
      : null;

  // Signature "availability meter": visualize how long the room stays free.
  // Fill is relative to an 8h reference so a whole-evening vacancy reads full
  // and a soon-ending gap reads short. Occupied rooms show an empty track.
  const REF_MIN = 480;
  const freeBlock =
    occupancy.status === "vacant"
      ? occupancy.freeMinutes ?? 0
      : occupancy.freeForMinutes ?? 0;
  const meterPct =
    isOccupied && !occupancy.freeAt
      ? 0
      : Math.max(4, Math.min(100, Math.round((freeBlock / REF_MIN) * 100)));
  const meterWarn =
    occupancy.status === "crunch" ||
    (occupancy.status === "vacant" && (occupancy.freeMinutes ?? 0) < 60);

  const metaBits = [
    entry.type,
    entry.capacity ? `~${entry.capacity} seats` : null,
    distM != null ? `${formatDistance(distM)} · ~${walkMinutes(distM)} min` : null,
  ].filter(Boolean);

  let freeLabel = "";
  let freeValue = "";
  let untilText = "";
  if (occupancy.status === "vacant") {
    freeLabel = "Free for";
    freeValue = occupancy.freeMinutes != null ? formatDuration(occupancy.freeMinutes) : "—";
    untilText = occupancy.nextClass
      ? `until ${formatTime(occupancy.nextClass.start)}`
      : occupancy.hasScheduleToday === false
        ? "no class today"
        : "rest of day";
  } else {
    freeLabel = occupancy.freeAt ? "Free at" : "";
    freeValue = occupancy.freeAt ? formatTime(occupancy.freeAt) : "Booked rest of day";
    untilText = occupancy.until ? `class ends ${formatTime(occupancy.until)}` : "";
  }

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(venue, entry)}
        className="glass relative w-full overflow-hidden p-5 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nus-blue/40 dark:hover:border-white/20"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] text-zinc-800">
              {venue}
            </div>
            {metaBits.length > 0 && (
              <div className="mt-1.5 truncate text-[12.5px] text-zinc-500">
                {metaBits.join(" · ")}
              </div>
            )}
          </div>
          <span className="mr-6 shrink-0 whitespace-nowrap font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-zinc-400">
            {entry.cluster}
          </span>
        </div>

        <div className="mt-4 mb-2.5 flex items-center gap-2">
          <StatusBadge info={occupancy} />
          {occupancy.status === "vacant" && occupancy.nextClass && (
            <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400">
              next {formatTime(occupancy.nextClass.start)}
            </span>
          )}
          {occupancy.status === "vacant" && occupancy.hasScheduleToday === false && (
            <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400">
              no class today
            </span>
          )}
          {isOccupied && occupancy.currentModule && (
            <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-zinc-400">
              {occupancy.currentModule}
            </span>
          )}
        </div>

        {/* Availability meter */}
        <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-zinc-100">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${meterPct}%`,
              background: meterWarn
                ? "linear-gradient(90deg,#f0b429,#d98a00)"
                : "linear-gradient(90deg,#12b981,#0e9f6e)",
            }}
          />
        </div>

        <div className="mt-2.5 flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-zinc-500">
            {freeLabel && `${freeLabel} `}
            <b className="font-mono font-semibold text-zinc-800">{freeValue}</b>
          </span>
          {untilText && (
            <span className="shrink-0 font-mono text-[11px] text-zinc-400">{untilText}</span>
          )}
        </div>
      </button>

      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(venue)}
          aria-label={isFavorite ? "Remove from saved" : "Save room"}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 z-10 rounded-full p-1 transition-transform active:scale-90"
        >
          <svg
            width="20"
            height="20"
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
    </div>
  );
}
