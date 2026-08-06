"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { CLUSTERS } from "@/data/clusters";
import { ROOM_TYPES, type RoomType } from "@/lib/room-classify";
import { isStandalone } from "@/lib/standalone";
import type { GeoErrorCode } from "@/hooks/useGeolocation";
import type { VenueEntry } from "@/types";

interface Props {
  allVenues: [string, VenueEntry][];
  activeCluster: string | null;
  searchQuery: string;
  detectedCluster: string | null;
  geoError: string | null;
  geoErrorCode: GeoErrorCode;
  activeType: RoomType | null;
  onTypeSelect: (type: RoomType | null) => void;
  showAll: boolean;
  onShowAll: () => void;
  minFree: number;
  onMinFreeSelect: (mins: number) => void;
  savedOnly: boolean;
  onToggleSaved: () => void;
  savedCount: number;
  onClusterSelect: (cluster: string | null) => void;
  onSearchChange: (q: string) => void;
  onAutoDetect: () => void;
  geoLoading: boolean;
}

const TYPE_LABELS: Record<RoomType, string> = {
  "Lecture Theatre": "Lecture Theatre",
  "Tutorial Room": "Tutorial",
  Lab: "Lab",
  "Seminar Room": "Seminar",
  Classroom: "Classroom",
};

const DURATIONS = [
  { mins: 0, label: "Any time" },
  { mins: 60, label: "≥ 1h" },
  { mins: 120, label: "≥ 2h" },
  { mins: 180, label: "≥ 3h" },
];

const HARDCODED_PILLS = [
  { id: null, label: "Near me" },
  { id: "Computing", label: "COM" },
  { id: "Engineering", label: "ENG" },
  { id: "Science", label: "SCI" },
  { id: "UTown", label: "UTown" },
  { id: "FASS", label: "FASS" },
  { id: "Business", label: "BIZ" },
];

export default function LocationPrompt({
  allVenues,
  activeCluster,
  searchQuery,
  detectedCluster,
  geoError,
  geoErrorCode,
  activeType,
  onTypeSelect,
  showAll,
  onShowAll,
  minFree,
  onMinFreeSelect,
  savedOnly,
  onToggleSaved,
  savedCount,
  onClusterSelect,
  onSearchChange,
  onAutoDetect,
  geoLoading,
}: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toUpperCase();
    return allVenues
      .filter(([code]) => code.toUpperCase().includes(q))
      .slice(0, 10)
      .map(([code]) => code);
  }, [allVenues, searchQuery]);

  // Context-aware geolocation guidance. A home-screen (standalone) web app has
  // no address bar, so blocked-location help must point at device Settings.
  const geoMessage = useMemo(() => {
    if (!geoError) return null;
    if (geoErrorCode === "denied") {
      return isStandalone()
        ? "Location is off for this app — turn it on in your device Settings (iOS: Settings › Privacy & Security › Location Services), then reopen."
        : "Location is blocked for this site — tap the lock/ⓘ icon in the address bar, set Location to Allow, then retry.";
    }
    return geoError;
  }, [geoError, geoErrorCode]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="glass relative z-30 space-y-4 p-4">
      {/* Auto-detect row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onAutoDetect}
          disabled={geoLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-nus-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-nus-blue/90 active:scale-[0.98] disabled:opacity-60"
        >
          {geoLoading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 21s-7-6.5-7-11a7 7 0 1114 0c0 4.5-7 11-7 11z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" fill="currentColor" />
            </svg>
          )}
          {geoLoading ? "Locating…" : "Find rooms near me"}
        </button>
        {detectedCluster ? (
          <span className="text-xs text-zinc-500">
            Near <span className="font-medium text-nus-blue">{detectedCluster}</span>
          </span>
        ) : geoError ? (
          <span className="text-xs text-amber-600">
            {geoMessage}{" "}
            <button
              onClick={onAutoDetect}
              className="font-medium text-nus-blue underline underline-offset-2"
            >
              Retry
            </button>
          </span>
        ) : (
          <span className="text-xs text-zinc-400">or pick a faculty</span>
        )}
      </div>

      {/* Cluster pills */}
      <div className="flex flex-wrap gap-2">
        {HARDCODED_PILLS.map((pill) => {
          const active =
            activeCluster === pill.id && !(pill.id === null && showAll);
          return (
            <button
              key={pill.id ?? "__all"}
              onClick={() => onClusterSelect(pill.id)}
              className={`rounded-full border px-3.5 py-1 text-sm font-medium transition-all active:scale-[0.97] ${
                active
                  ? "border-nus-blue bg-nus-blue text-white shadow-sm"
                  : "border-zinc-200 bg-white/60 text-zinc-600 hover:border-nus-blue hover:text-nus-blue"
              }`}
            >
              {pill.label}
            </button>
          );
        })}
        <button
          onClick={onShowAll}
          className={`rounded-full border px-3.5 py-1 text-sm font-medium transition-all active:scale-[0.97] ${
            showAll
              ? "border-nus-blue bg-nus-blue text-white shadow-sm"
              : "border-zinc-200 bg-white/60 text-zinc-600 hover:border-nus-blue hover:text-nus-blue"
          }`}
        >
          All venues
        </button>
      </div>

      {/* Room-type filter */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          onClick={() => onTypeSelect(null)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] ${
            activeType === null
              ? "border-nus-orange bg-nus-orange/10 text-nus-orange"
              : "border-zinc-200 bg-white/60 text-zinc-500 hover:border-nus-orange hover:text-nus-orange"
          }`}
        >
          Any type
        </button>
        {ROOM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onTypeSelect(activeType === t ? null : t)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] ${
              activeType === t
                ? "border-nus-orange bg-nus-orange/10 text-nus-orange"
                : "border-zinc-200 bg-white/60 text-zinc-500 hover:border-nus-orange hover:text-nus-orange"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Duration + saved filters */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        {DURATIONS.map((d) => (
          <button
            key={d.mins}
            onClick={() => onMinFreeSelect(d.mins)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] ${
              minFree === d.mins
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 bg-white/60 text-zinc-500 hover:border-emerald-500 hover:text-emerald-700"
            }`}
          >
            {d.label}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200" />
        <button
          onClick={onToggleSaved}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] ${
            savedOnly
              ? "border-nus-orange bg-nus-orange/10 text-nus-orange"
              : "border-zinc-200 bg-white/60 text-zinc-500 hover:border-nus-orange hover:text-nus-orange"
          }`}
        >
          ★ Saved{savedCount ? ` (${savedCount})` : ""}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFocused(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search building, block or LT code (e.g., E3, COM1)…"
          className="w-full rounded-lg border border-zinc-200 bg-white/60 py-2.5 pl-4 pr-9 text-sm text-zinc-800 placeholder-zinc-400 outline-none transition-colors focus:border-nus-orange focus:ring-2 focus:ring-nus-orange/20"
        />
        {searchQuery && (
          <button
            onClick={() => {
              onSearchChange("");
              setFocused(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {focused && suggestions.length > 0 && (
          <ul
            ref={listRef}
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
          >
            {suggestions.map((code) => (
              <li
                key={code}
                onClick={() => {
                  onSearchChange(code);
                  setFocused(false);
                }}
                className="cursor-pointer px-4 py-2 font-mono text-sm text-zinc-700 hover:bg-nus-blue/5 hover:text-nus-blue"
              >
                {code}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
