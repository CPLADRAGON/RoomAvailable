"use client";

import type { VenueEntry, CalendarEntry } from "@/types";
import RoomCard from "./RoomCard";

interface Props {
  venues: [string, VenueEntry][];
  now: Date;
  semester: CalendarEntry | null;
  userLoc: { lat: number; lng: number } | null;
  isFavorite?: (venue: string) => boolean;
  onToggleFavorite?: (venue: string) => void;
  emptyMessage?: React.ReactNode;
  onVenueSelect: (venue: string, entry: VenueEntry) => void;
}

export default function RoomGrid({
  venues,
  now,
  semester,
  userLoc,
  isFavorite,
  onToggleFavorite,
  emptyMessage,
  onVenueSelect,
}: Props) {
  if (venues.length === 0) {
    return (
      <div className="glass py-12 text-center">
        <p className="text-sm text-zinc-400">
          {emptyMessage ?? "No rooms match your selection."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {venues.map(([code, entry]) => (
        <RoomCard
          key={code}
          venue={code}
          entry={entry}
          now={now}
          semester={semester}
          userLoc={userLoc}
          isFavorite={isFavorite?.(code)}
          onToggleFavorite={onToggleFavorite}
          onSelect={onVenueSelect}
        />
      ))}
    </div>
  );
}
