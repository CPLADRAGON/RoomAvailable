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

const ACCENT: Record<string, string> = {
  vacant: "before:bg-status-vacant",
  occupied: "before:bg-status-occupied",
  crunch: "before:bg-status-crunch",
};

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

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(venue, entry)}
        className={`glass relative w-full overflow-hidden p-4 text-left transition-transform duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer before:absolute before:inset-y-0 before:left-0 before:w-1 ${ACCENT[occupancy.status]}`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="font-mono text-xl font-bold tracking-tight text-nus-blue">
            {venue}
          </span>
          <span className="mr-7 whitespace-nowrap rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500">
            {entry.cluster}
          </span>
        </div>

        {(entry.type || entry.capacity || distM != null) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {entry.type && (
              <span className="rounded-full bg-nus-blue/10 px-2 py-0.5 text-[11px] font-medium text-nus-blue">
                {entry.type}
              </span>
            )}
            {entry.capacity ? (
              <span className="text-[11px] text-zinc-400">~{entry.capacity} seats</span>
            ) : null}
            {distM != null && (
              <span className="text-[11px] font-medium text-zinc-500 sm:w-full">
                <span className="sm:hidden">· </span>
                {formatDistance(distM)} · ~{walkMinutes(distM)} min
              </span>
            )}
          </div>
        )}

        <div className="mb-2">
          <StatusBadge info={occupancy} />
        </div>

        {isOccupied && (
          <p className="text-sm text-zinc-700">
            <span className="font-medium">{occupancy.currentModule}</span>
            {occupancy.until && (
              <span className="text-zinc-400"> · ends {formatTime(occupancy.until)}</span>
            )}
          </p>
        )}

        {occupancy.status === "vacant" && occupancy.freeMinutes != null && (
          <p className="text-sm text-emerald-700">
            Free for{" "}
            <span className="font-semibold">
              {formatDuration(occupancy.freeMinutes)}
            </span>
            {occupancy.nextClass && (
              <span className="text-zinc-400">
                {" "}
                · next {occupancy.nextClass.module} at{" "}
                {formatTime(occupancy.nextClass.start)}
              </span>
            )}
          </p>
        )}
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
