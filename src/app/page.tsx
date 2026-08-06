"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { VenueEntry } from "@/types";
import { useVenueData } from "@/hooks/useVenueData";
import { useGeolocation } from "@/hooks/useGeolocation";
import { computeOccupancy, getSingaporeTime, formatTime } from "@/lib/occupancy-engine";
import { getCurrentSemester, getCurrentWeek, getPeriodLabel, getHeaderPeriodLabel } from "@/lib/calendar";
import { findNearestCluster, venueDistance } from "@/lib/cluster-map";
import { clearCache } from "@/lib/venue-cache";
import type { RoomType } from "@/lib/room-classify";
import { useFavorites } from "@/hooks/useFavorites";
import { useRecents } from "@/hooks/useRecents";
import LocationPrompt from "@/components/LocationPrompt";
import RoomGrid from "@/components/RoomGrid";
import VenueDetail from "@/components/VenueDetail";
import FeedbackModal from "@/components/FeedbackModal";
import AcknowledgementModal from "@/components/AcknowledgementModal";
import ThemeToggle from "@/components/ThemeToggle";
import OnboardingTip from "@/components/OnboardingTip";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="glass py-12 text-center text-sm text-zinc-400">
      Loading map…
    </div>
  ),
});

const NEAR_ME_LIMIT = 60;
const MAP_PIN_LIMIT = 200;

export default function Home() {
  const { venues, loading, error, refreshing, lastUpdated, refresh } =
    useVenueData();
  const geo = useGeolocation();
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();
  const { push: pushRecent } = useRecents();

  const [now, setNow] = useState<Date>(() => getSingaporeTime());
  // Plan-ahead time: when set, availability is computed as-of this time today
  // instead of the live clock ("what's free at 2 PM?"). null = live / Now.
  const [planTime, setPlanTime] = useState<Date | null>(null);
  const [cluster, setCluster] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [minFree, setMinFree] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showAllNear, setShowAllNear] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [detailVenue, setDetailVenue] = useState<[string, VenueEntry] | null>(null);
  const autoRequested = useRef(false);
  // Gates the header clock's *displayed text* only (not `now`, which correctly
  // drives occupancy calculations from first render). `now` is computed once
  // during SSR and again during client hydration — those two calls happen at
  // genuinely different instants, so if a minute boundary falls between them
  // the rendered "HH:MM" text can differ and trigger a hydration mismatch.
  // Rendering the clock text only after mount sidesteps that entirely.
  const [clockMounted, setClockMounted] = useState(false);

  const userLoc = useMemo(
    () => (geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : null),
    [geo.lat, geo.lng]
  );

  const openDetail = useCallback(
    (v: string, e: VenueEntry) => {
      setDetailVenue([v, e]);
      pushRecent(v);
    },
    [pushRecent]
  );

  // Shareable venue links: capture any ?venue= from the initial URL once, then
  // open that room's detail as soon as the venue data is available.
  const initialVenueParam = useRef<string | null>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("venue")
      : null
  );
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || venues.length === 0) return;
    deepLinkHandled.current = true;
    const code = initialVenueParam.current;
    if (!code) return;
    const match = venues.find(([c]) => c.toUpperCase() === code.toUpperCase());
    if (match) openDetail(match[0], match[1]);
  }, [venues, openDetail]);

  // Keep the URL's ?venue= in sync with the open detail modal (no navigation,
  // no scroll jump) so the address bar is always shareable and back-friendly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (detailVenue) url.searchParams.set("venue", detailVenue[0]);
    else url.searchParams.delete("venue");
    window.history.replaceState(null, "", url.toString());
  }, [detailVenue]);

  // Live clock tick
  useEffect(() => {
    setClockMounted(true);
    const id = setInterval(() => setNow(getSingaporeTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-locate ONLY if permission was already granted (silent, no prompt).
  // For "ask"/unknown states we wait for the user to tap the button — a real
  // user gesture reliably triggers the browser's permission prompt, whereas a
  // gesture-less request on load is often auto-denied by the browser.
  useEffect(() => {
    if (autoRequested.current) return;
    autoRequested.current = true;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") geo.requestLocation();
      })
      .catch(() => {
        /* Permissions API unavailable — wait for the button tap */
      });
  }, [geo]);

  const handleAutoDetect = useCallback(() => {
    geo.requestLocation();
    // Switch into the near-me view regardless of current browsing state, so
    // the button always shows nearby rooms once location resolves (matching
    // the "Near me" pill's behavior). Room-type/duration filters are kept.
    setCluster(null);
    setSearch("");
    setShowAll(false);
    setSavedOnly(false);
  }, [geo]);

  const detectedCluster = useMemo(
    () =>
      geo.lat != null && geo.lng != null
        ? findNearestCluster(geo.lat, geo.lng)
        : null,
    [geo.lat, geo.lng]
  );

  const semester = useMemo(() => getCurrentSemester(now), [now]);
  const periodLabel = useMemo(() => getPeriodLabel(now), [now]);

  // The time availability is computed against: the plan-ahead time if set,
  // otherwise the live clock.
  const effectiveNow = planTime ?? now;
  const planHHMM = planTime
    ? `${String(planTime.getHours()).padStart(2, "0")}${String(planTime.getMinutes()).padStart(2, "0")}`
    : "";
  const planInputValue = planTime
    ? `${String(planTime.getHours()).padStart(2, "0")}:${String(planTime.getMinutes()).padStart(2, "0")}`
    : "";
  const setPlanFromInput = (value: string) => {
    if (!value) {
      setPlanTime(null);
      return;
    }
    const [h, m] = value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    setPlanTime(t);
  };
  const headerLabelFull = useMemo(() => getHeaderPeriodLabel(now, false), [now]);
  const inTeachingWeek = useMemo(() => getCurrentWeek(now) > 0, [now]);
  const inSpecialTerm = semester?.semester === 3 || semester?.semester === 4;

  // Occupancy for every venue at the effective time (live clock, or the
  // plan-ahead time when the user is checking "what's free at 2 PM?").
  const withOccupancy = useMemo(
    () =>
      venues.map(([code, entry]) => ({
        code,
        entry,
        occ: computeOccupancy(entry, effectiveNow, semester),
      })),
    [venues, effectiveNow, semester]
  );

  // Browse mode (a cluster pill, search query, the saved filter, or all-venues).
  const browsing = Boolean(cluster || search.trim() || savedOnly || showAll);

  // Near-me: all vacant rooms ranked by nearness then longest free block.
  const nearMe = useMemo(() => {
    const hasGeo = geo.lat != null && geo.lng != null;
    let vacant = withOccupancy.filter((v) => v.occ.status === "vacant");
    if (roomType) vacant = vacant.filter((v) => v.entry.type === roomType);
    if (minFree > 0)
      vacant = vacant.filter((v) => (v.occ.freeMinutes ?? 0) >= minFree);
    vacant.sort((a, b) => {
      if (hasGeo) {
        const da = venueDistance(a.entry, geo.lat!, geo.lng!);
        const db = venueDistance(b.entry, geo.lat!, geo.lng!);
        if (da !== db) return da - db;
      }
      const fa = a.occ.freeMinutes ?? 0;
      const fb = b.occ.freeMinutes ?? 0;
      if (fb !== fa) return fb - fa;
      return a.code.localeCompare(b.code);
    });
    return vacant;
  }, [withOccupancy, geo.lat, geo.lng, roomType, minFree]);

  // Browse filter: cluster + fuzzy search + saved + type + duration.
  const filtered = useMemo(() => {
    let result = withOccupancy;
    if (cluster) result = result.filter((v) => v.entry.cluster === cluster);
    if (roomType) result = result.filter((v) => v.entry.type === roomType);
    if (savedOnly) result = result.filter((v) => favorites.has(v.code));
    if (minFree > 0)
      result = result.filter(
        (v) => v.occ.status === "vacant" && (v.occ.freeMinutes ?? 0) >= minFree
      );
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      result = result.filter((v) => v.code.toUpperCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const rank = (s: string) => (s === "vacant" ? 0 : 1);
      const r = rank(a.occ.status) - rank(b.occ.status);
      if (r !== 0) return r;
      return a.code.localeCompare(b.code);
    });
  }, [withOccupancy, cluster, search, roomType, savedOnly, minFree, favorites]);

  // Same as `filtered` but ignoring the "refinement" filters (room type,
  // duration, saved-only) — kept to just cluster + search. Used to detect
  // when a search/cluster genuinely matches a venue that's only hidden by
  // those refinement filters, so we can show a specific, actionable message
  // ("N rooms match X but are hidden by your filters") instead of a generic
  // "no results", and offer a one-tap way to clear just those filters.
  const filteredIgnoringRefinements = useMemo(() => {
    let result = withOccupancy;
    if (cluster) result = result.filter((v) => v.entry.cluster === cluster);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      result = result.filter((v) => v.code.toUpperCase().includes(q));
    }
    return result;
  }, [withOccupancy, cluster, search]);

  const activeRefinementLabels = useMemo(() => {
    const labels: string[] = [];
    if (roomType) labels.push(roomType);
    if (minFree > 0) labels.push(`≥ ${minFree / 60}h`);
    if (savedOnly) labels.push("Saved");
    return labels;
  }, [roomType, minFree, savedOnly]);

  const hiddenByFilters =
    filtered.length === 0 &&
    filteredIgnoringRefinements.length > 0 &&
    activeRefinementLabels.length > 0;

  const clearRefinementFilters = useCallback(() => {
    setRoomType(null);
    setMinFree(0);
    setSavedOnly(false);
  }, []);

  const nearShown = showAllNear ? nearMe : nearMe.slice(0, NEAR_ME_LIMIT);

  const mapRooms = useMemo(() => {
    const src = browsing ? filtered : nearMe;
    return src
      .slice(0, MAP_PIN_LIMIT)
      .map((v) => ({ code: v.code, entry: v.entry, status: v.occ.status }));
  }, [browsing, filtered, nearMe]);

  return (
    <>
      {/* Signature brand thread */}
      <div className="brand-thread" />
      {/* Editorial header */}
      <header className="app-header sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl flex-col px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em] sm:text-2xl">
              <span className="text-nus-blue">NUS</span>{" "}
              <span className="text-zinc-800">Vacansee</span>
              <span className="text-nus-orange">.</span>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setFeedbackOpen(true)}
                aria-label="Send feedback"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-nus-blue hover:text-nus-blue"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 014 11.5 8.5 8.5 0 0112.5 3 8.38 8.38 0 0121 11.5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="hidden min-[400px]:inline">Feedback</span>
              </button>
            </div>
          </div>
          <p
            title={headerLabelFull}
            className="mt-1.5 w-full font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-400"
          >
            {headerLabelFull}
            {clockMounted && (
              <>
                {" · "}
                <span className="tabular-nums">
                  {now.toLocaleTimeString("en-SG", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Singapore",
                  })}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {/* Loading state — skeleton cards give a better sense of progress than
            a lone spinner, on both phone and desktop. */}
        {loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass animate-pulse p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-5 w-24 rounded bg-zinc-200/80" />
                  <div className="h-4 w-10 rounded bg-zinc-200/60" />
                </div>
                <div className="mb-3 h-4 w-20 rounded-full bg-zinc-200/60" />
                <div className="mb-2 h-5 w-24 rounded-full bg-zinc-200/70" />
                <div className="h-4 w-32 rounded bg-zinc-200/50" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="glass border border-red-200 py-8 text-center">
            <p className="text-sm text-red-600">
              Couldn’t load venue data: {error}
            </p>
            <button
              onClick={() => refresh()}
              className="mt-3 rounded-lg bg-nus-blue px-4 py-2 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main UI (loaded) */}
        {!loading && !error && (
          <>
            <OnboardingTip />
            {/* Non-teaching-period banner */}
            {!inTeachingWeek && !inSpecialTerm && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{periodLabel}</span> — no classes
                scheduled, so rooms are shown as free from the timetable. Ad-hoc
                bookings or exams may not be reflected; please verify on site.
              </div>
            )}
            {/* Special-term banner: classes are scheduled but coverage is limited */}
            {inSpecialTerm && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{periodLabel}</span> — only
                special-term classes are scheduled, so most rooms are free. Ad-hoc
                bookings may not be reflected; please verify on site.
              </div>
            )}

            <LocationPrompt
              allVenues={venues}
              activeCluster={cluster}
              searchQuery={search}
              detectedCluster={detectedCluster}
              geoError={geo.error}
              geoErrorCode={geo.errorCode}
              activeType={roomType}
              onTypeSelect={setRoomType}
              showAll={showAll}
              onShowAll={() => {
                setShowAll(true);
                setCluster(null);
                setSavedOnly(false);
                // Search text is intentionally preserved: "All venues" widens
                // scope, it shouldn't erase what the user typed. This is the
                // fix for a reported dead-end — a search hidden by an active
                // room-type/duration filter used to force users to retype
                // their search after tapping this button.
              }}
              minFree={minFree}
              onMinFreeSelect={setMinFree}
              savedOnly={savedOnly}
              onToggleSaved={() => setSavedOnly((s) => !s)}
              savedCount={favorites.size}
              onClusterSelect={(c) => {
                setCluster(c);
                setShowAll(false);
                // Search text intentionally preserved here too, for the same
                // reason as onShowAll above.
              }}
              onSearchChange={setSearch}
              onAutoDetect={handleAutoDetect}
              geoLoading={geo.loading}
            />

            {/* Plan-ahead time picker: "what's free at 2 PM?" */}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Free at
              </span>
              <div className="inline-flex rounded-full border border-zinc-200 bg-white/60 p-0.5 text-xs font-medium">
                <button
                  onClick={() => setPlanTime(null)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    planTime === null ? "bg-nus-blue text-white" : "text-zinc-500 hover:text-nus-blue"
                  }`}
                >
                  Now
                </button>
                <button
                  onClick={() => setPlanTime(new Date(effectiveNow.getTime() + 3600_000))}
                  className="rounded-full px-3 py-1 text-zinc-500 transition-colors hover:text-nus-blue"
                >
                  +1h
                </button>
                <button
                  onClick={() => setPlanTime(new Date(effectiveNow.getTime() + 7200_000))}
                  className="rounded-full px-3 py-1 text-zinc-500 transition-colors hover:text-nus-blue"
                >
                  +2h
                </button>
              </div>
              <input
                type="time"
                aria-label="Check availability at a specific time"
                value={planInputValue}
                onChange={(e) => setPlanFromInput(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white/60 px-2.5 py-1 font-mono text-xs text-zinc-700 outline-none transition-colors focus:border-nus-blue focus:ring-2 focus:ring-nus-blue/20"
              />
              {planTime && (
                <span className="inline-flex items-center gap-1.5 text-xs text-nus-blue">
                  <span className="font-medium">at {formatTime(planHHMM)}</span>
                  <button
                    onClick={() => setPlanTime(null)}
                    className="font-medium underline underline-offset-2 hover:text-nus-blue/80"
                  >
                    back to now
                  </button>
                </span>
              )}
            </div>

            {/* View toggle */}
            <div className="mt-4 flex justify-end">
              <div className="inline-flex rounded-full border border-zinc-200 bg-white/60 p-0.5 text-xs font-medium">
                {(["list", "map"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-full px-3 py-1 capitalize transition-colors ${
                      view === v
                        ? "bg-nus-blue text-white"
                        : "text-zinc-500 hover:text-nus-blue"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Results */}
            <div className="mt-3">
              {view === "map" ? (
                <>
                  <p className="mb-3 text-xs text-zinc-500">
                    {mapRooms.length} room{mapRooms.length !== 1 ? "s" : ""} on map
                    {browsing ? "" : " · free now"}
                  </p>
                  <MapView rooms={mapRooms} userLoc={userLoc} onSelect={openDetail} />
                </>
              ) : browsing ? (
                <>
                  <p className="mb-3 text-xs text-zinc-500">
                    {filtered.length} room{filtered.length !== 1 ? "s" : ""}
                    {showAll ? " · all venues" : ""}
                    {savedOnly ? " saved" : ""}
                    {cluster ? ` in ${cluster}` : ""}
                    {roomType ? ` · ${roomType}` : ""}
                    {minFree ? ` · free ≥ ${minFree / 60}h` : ""}
                    {search ? ` matching “${search}”` : ""}
                  </p>
                  <RoomGrid
                    venues={filtered.map((v) => [v.code, v.entry])}
                    now={effectiveNow}
                    semester={semester}
                    userLoc={userLoc}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                    emptyMessage={
                      hiddenByFilters ? (
                        <>
                          {filteredIgnoringRefinements.length} room
                          {filteredIgnoringRefinements.length !== 1 ? "s" : ""}
                          {search ? ` match "${search}"` : " match your search"}{" "}
                          but {filteredIgnoringRefinements.length !== 1 ? "are" : "is"}{" "}
                          hidden by your filters (
                          {activeRefinementLabels.join(", ")}).
                          <br />
                          <button
                            onClick={clearRefinementFilters}
                            className="mt-2 rounded-full border border-nus-blue/30 bg-white/60 px-3 py-1 text-xs font-medium text-nus-blue transition-colors hover:bg-nus-blue/5"
                          >
                            Clear filters
                          </button>
                        </>
                      ) : savedOnly ? (
                        "No saved rooms yet — tap the ★ on a room to save it."
                      ) : (
                        "No rooms match your search."
                      )
                    }
                    onVenueSelect={openDetail}
                  />
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-end justify-between gap-2">
                    <div>
                      <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-zinc-800">
                        {planTime ? `Free at ${formatTime(planHHMM)} near you` : "Available now near you"}
                      </h2>
                      <p className="text-xs text-zinc-500">
                        {detectedCluster
                          ? `${nearMe.length} free · nearest: ${detectedCluster}`
                          : `${nearMe.length} free · enable location to sort by nearness`}
                        {roomType ? ` · ${roomType}` : ""}
                        {minFree ? ` · ≥ ${minFree / 60}h` : ""}
                      </p>
                    </div>
                  </div>

                  <RoomGrid
                    venues={nearShown.map((v) => [v.code, v.entry])}
                    now={effectiveNow}
                    semester={semester}
                    userLoc={userLoc}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                    emptyMessage="No free rooms right now."
                    onVenueSelect={openDetail}
                  />

                  {nearMe.length > NEAR_ME_LIMIT && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => setShowAllNear((s) => !s)}
                        className="rounded-full border border-nus-blue/30 bg-white/60 px-4 py-1.5 text-sm font-medium text-nus-blue transition-colors hover:bg-nus-blue/5"
                      >
                        {showAllNear
                          ? "Show fewer"
                          : `Show all ${nearMe.length} free rooms`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-4 space-y-1 border-t border-zinc-200/60 px-4 py-4 text-center text-xs text-zinc-400">
        <p>
          Timetable &amp; venue data from{" "}
          <a
            href="https://nusmods.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-nus-blue"
          >
            NUSMods
          </a>{" "}
          (MIT) · map ©{" "}
          <a
            href="https://www.onemap.gov.sg/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-nus-blue"
          >
            OneMap
          </a>{" "}
          / Singapore Land Authority
          {lastUpdated
            ? ` · updated ${new Date(lastUpdated).toLocaleString("en-SG", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : " · offline snapshot"}
        </p>
        <p className="text-zinc-300">
          Not affiliated with NUS. Availability is computed from class schedules
          and may not reflect ad-hoc bookings — please verify on site.
        </p>
        <button
          onClick={async () => {
            await clearCache();
            refresh();
          }}
          disabled={refreshing}
          className="mt-1 text-zinc-400 underline hover:text-nus-blue disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh data / clear cache"}
        </button>
        <span className="px-1 text-zinc-300">·</span>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="text-zinc-400 underline hover:text-nus-blue"
        >
          Send feedback
        </button>
        <span className="px-1 text-zinc-300">·</span>
        <button
          onClick={() => setAckOpen(true)}
          className="text-zinc-400 underline hover:text-nus-blue"
        >
          Acknowledgements
        </button>
        <p className="pt-1 text-zinc-300">
          Built by{" "}
          <button
            onClick={() => setAckOpen(true)}
            className="font-medium text-zinc-400 underline hover:text-nus-blue"
          >
            WANG BOYU
          </button>
        </p>
      </footer>

      {/* Feedback modal */}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      {ackOpen && <AcknowledgementModal onClose={() => setAckOpen(false)} />}

      {/* Venue detail modal */}
      {detailVenue && (
        <VenueDetail
          venue={detailVenue[0]}
          entry={detailVenue[1]}
          now={now}
          semester={semester}
          lastUpdated={lastUpdated}
          isFavorite={isFavorite(detailVenue[0])}
          onToggleFavorite={toggleFavorite}
          onClose={() => setDetailVenue(null)}
        />
      )}
    </>
  );
}
