"use client";

import { useMemo, useState, useEffect } from "react";
import type { VenueEntry, TimetableSlot, CalendarEntry } from "@/types";
import { formatTime } from "@/lib/occupancy-engine";
import { getCurrentWeek, getPeriodLabel } from "@/lib/calendar";
import { classLabel, classLabelFull } from "@/lib/lesson";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface Props {
  entry: VenueEntry;
  now: Date;
  semester: CalendarEntry | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

// Hour-column width & lane height per breakpoint. Wider on desktop so labels
// have real room and gridlines are proportionally easier to read.
const HOUR_W_MOBILE = 52;
const HOUR_W_DESKTOP = 84;
const DAY_COL = 44; // px width of the sticky day-label column
const LANE_H_MOBILE = 26;
const LANE_H_DESKTOP = 34;

interface LaneItem {
  slot: TimetableSlot;
  lane: number;
}
interface DayLayout {
  items: LaneItem[];
  lanes: number;
}

function toMin(hhmm: string): number {
  return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(2), 10);
}

// Dedupe identical slots, then assign overlapping classes to separate lanes so
// concurrent bookings stack vertically instead of overlapping on top of each other.
function packLanes(slots: TimetableSlot[]): DayLayout {
  const seen = new Set<string>();
  const unique: TimetableSlot[] = [];
  for (const s of slots) {
    const key = `${s.start}|${s.end}|${s.module}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  unique.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const laneEnds: string[] = [];
  const items: LaneItem[] = [];
  for (const s of unique) {
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else {
      laneEnds[lane] = s.end;
    }
    items.push({ slot: s, lane });
  }
  return { items, lanes: Math.max(1, laneEnds.length) };
}

// Compact a sorted week-number list into ranges, e.g. [3,4,5,7] -> "3–5, 7".
function formatWeeks(weeks: number[]): string {
  if (weeks.length === 0) return "";
  const sorted = [...weeks].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (i < sorted.length) {
      start = sorted[i];
      prev = sorted[i];
    }
  }
  return parts.join(", ");
}

function semLabel(s: number, long = false): string {
  if (s === 3) return long ? "Special Term I" : "ST I";
  if (s === 4) return long ? "Special Term II" : "ST II";
  return long ? `Semester ${s}` : `Sem ${s}`;
}

function formatDates(dates: string[]): string {
  if (dates.length === 0) return "";
  const sorted = [...dates].sort();
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  };
  const n = sorted.length;
  const range =
    n === 1 ? fmt(sorted[0]) : `${fmt(sorted[0])} – ${fmt(sorted[n - 1])}`;
  return `${n} session${n > 1 ? "s" : ""} · ${range}`;
}

export default function WeekGrid({ entry, now, semester }: Props) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const HOUR_W = isDesktop ? HOUR_W_DESKTOP : HOUR_W_MOBILE;
  const LANE_H = isDesktop ? LANE_H_DESKTOP : LANE_H_MOBILE;
  const currentWeek = getCurrentWeek(now); // instructional week, or 0
  const todayName = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];

  // Which semesters does this venue actually have classes in?
  const availableSems = useMemo(() => {
    const set = new Set<number>();
    for (const day of [...DAYS, "Sunday"]) {
      const slots = (entry as unknown as Record<string, TimetableSlot[] | undefined>)[day];
      if (slots) for (const s of slots) set.add(s.semester);
    }
    return [...set].sort((a, b) => a - b);
  }, [entry]);

  // Semester currently shown. Default to the active semester, else the first
  // one this venue has data for. Reset the user's choice when the venue changes.
  const [override, setOverride] = useState<number | null>(null);
  useEffect(() => setOverride(null), [entry]);
  const viewSem =
    override ??
    (semester && availableSems.includes(semester.semester)
      ? semester.semester
      : availableSems[0]) ??
    1;
  const isCurrentView = semester?.semester === viewSem;

  // Active slots for the shown semester, packed into lanes. This never mixes
  // semesters. The teaching-week filter only applies when we're actually in the
  // shown semester; otherwise the full semester schedule is displayed.
  const byDay = useMemo(() => {
    const map: Record<string, DayLayout> = {};
    for (const day of [...DAYS, "Sunday"]) {
      const slots = (entry as unknown as Record<string, TimetableSlot[] | undefined>)[day];
      if (!slots) continue;
      const active = slots.filter((s) => {
        if (s.semester !== viewSem) return false;
        if (isCurrentView && currentWeek) return s.weeks.includes(currentWeek);
        return true;
      });
      if (active.length) map[day] = packLanes(active);
    }
    return map;
  }, [entry, viewSem, isCurrentView, currentWeek]);

  // Time window: default 08:00–22:00, expanded to fit any out-of-range class.
  const { winStart, winEnd, hours } = useMemo(() => {
    let lo = 8 * 60;
    let hi = 22 * 60;
    for (const layout of Object.values(byDay)) {
      for (const { slot } of layout.items) {
        lo = Math.min(lo, Math.floor(toMin(slot.start) / 60) * 60);
        hi = Math.max(hi, Math.ceil(toMin(slot.end) / 60) * 60);
      }
    }
    const hrs: number[] = [];
    for (let h = lo; h <= hi; h += 60) hrs.push(h);
    return { winStart: lo, winEnd: hi, hours: hrs };
  }, [byDay]);

  const span = winEnd - winStart;
  const trackWidth = hours.length > 1 ? (hours.length - 1) * HOUR_W : HOUR_W;
  const pct = (min: number) => ((min - winStart) / span) * 100;

  const rows = byDay["Sunday"] ? [...DAYS, "Sunday"] : DAYS;

  const [selected, setSelected] = useState<{
    day: string;
    slot: TimetableSlot;
  } | null>(null);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isCurrentView && nowMin >= winStart && nowMin <= winEnd;
  const nowLabel = now.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });

  // ISO date helpers (local SG calendar day, matching how slot.dates are stored).
  const isoLocal = (d: Date) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const todayISO = isoLocal(now);
  // The set of ISO dates in the current Mon–Sun week (for special-term slots).
  const weekDates = useMemo(() => {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    const set = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      set.add(isoLocal(d));
    }
    return set;
  }, [now]);

  // Classify a block relative to *now* so the grid is honest: only sessions that
  // actually run this week/today look booked; recurring-schedule entries that
  // aren't happening now (other weeks, other dates, or another semester's
  // "Full semester" view) render as a muted reference outline.
  type SlotState = "live" | "week" | "reference";
  const slotState = (s: TimetableSlot, day: string): SlotState => {
    if (!isCurrentView) return "reference";
    let inWeek: boolean;
    let onToday: boolean;
    if (s.dates && s.dates.length > 0) {
      inWeek = s.dates.some((d) => weekDates.has(d));
      onToday = s.dates.includes(todayISO);
    } else {
      inWeek = currentWeek > 0 && s.weeks.includes(currentWeek);
      onToday = inWeek && day === todayName;
    }
    if (onToday && day === todayName) {
      const inNow = nowMin >= toMin(s.start) && nowMin < toMin(s.end);
      if (inNow) return "live";
    }
    return inWeek ? "week" : "reference";
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {availableSems.length > 1 ? (
          <div className="inline-flex rounded-full border border-zinc-200 bg-white/60 p-0.5 text-[11px] font-medium">
            {availableSems.map((s) => (
              <button
                key={s}
                onClick={() => setOverride(s)}
                className={`rounded-full px-2.5 py-0.5 transition-colors ${
                  viewSem === s
                    ? "bg-nus-blue text-white"
                    : "text-zinc-500 hover:text-nus-blue"
                }`}
              >
                {semLabel(s)}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-medium text-zinc-500">
            {semLabel(viewSem, true)}
          </span>
        )}
        {isCurrentView && currentWeek > 0 ? (
          <span className="rounded-full bg-nus-blue/10 px-2 py-0.5 text-[10px] font-medium text-nus-blue">
            Week {currentWeek}
          </span>
        ) : isCurrentView ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
            {getPeriodLabel(now)}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400">Full semester</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200/70 bg-white/40">
        <div style={{ minWidth: DAY_COL + trackWidth }}>
          {/* Hour header */}
          <div className="flex border-b border-zinc-200/70">
            <div
              className="sticky left-0 z-20 shrink-0 bg-white/80 backdrop-blur"
              style={{ width: DAY_COL }}
            />
            <div className="relative h-6" style={{ width: trackWidth }}>
              {hours.slice(0, -1).map(
                (h, i) =>
                  i % 2 === 1 && (
                    <span
                      key={`band-${h}`}
                      className="absolute inset-y-0 bg-zinc-500/[0.05]"
                      style={{
                        left: `${(i / (hours.length - 1)) * 100}%`,
                        width: `${(1 / (hours.length - 1)) * 100}%`,
                      }}
                    />
                  )
              )}
              {hours.map((h, i) => (
                <span
                  key={h}
                  className="absolute top-1 -translate-x-1/2 font-mono text-[10px] text-zinc-400 sm:text-xs"
                  style={{ left: `${(i / (hours.length - 1)) * 100}%` }}
                >
                  {String(h / 60).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          {/* Day rows */}
          {rows.map((day) => {
            const layout = byDay[day];
            const lanes = layout?.lanes ?? 1;
            const rowH = Math.max(44, lanes * LANE_H + 8);
            const isToday = day === todayName && isCurrentView;
            return (
              <div
                key={day}
                className={`flex border-b border-zinc-100 last:border-b-0 ${
                  isToday ? "bg-nus-orange/5" : ""
                }`}
              >
                <div
                  className={`sticky left-0 z-20 flex shrink-0 items-center justify-center bg-white/80 px-1 text-xs font-medium backdrop-blur ${
                    isToday ? "text-nus-orange" : "text-zinc-500"
                  }`}
                  style={{ width: DAY_COL }}
                >
                  {DAY_SHORT[day]}
                </div>

                <div className="relative" style={{ width: trackWidth, height: rowH }}>
                  {/* Alternating hour-column shading (Google-Calendar style) instead
                      of hard vertical rules — gives hour orientation without harsh lines. */}
                  {hours.slice(0, -1).map(
                    (h, i) =>
                      i % 2 === 1 && (
                        <span
                          key={h}
                          className="absolute inset-y-0 bg-zinc-500/[0.05]"
                          style={{
                            left: `${(i / (hours.length - 1)) * 100}%`,
                            width: `${(1 / (hours.length - 1)) * 100}%`,
                          }}
                        />
                      )
                  )}

                  {/* Dim past hours on today */}
                  {isToday && showNow && (
                    <span
                      className="absolute inset-y-0 left-0 bg-zinc-900/[0.04]"
                      style={{ width: `${pct(nowMin)}%` }}
                    />
                  )}

                  {/* Free-all-day label */}
                  {!layout && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium uppercase tracking-wider text-zinc-300">
                      Free
                    </span>
                  )}

                  {/* Occupied blocks (lane-packed) */}
                  {layout?.items.map(({ slot: s, lane }, i) => {
                    const left = pct(toMin(s.start));
                    const width = pct(toMin(s.end)) - left;
                    const isSel =
                      selected?.day === day && selected?.slot === s;
                    const cls = classLabelFull(s);
                    const state = slotState(s, day);
                    const solid = state === "live" || state === "week";
                    const base =
                      state === "live"
                        ? "bg-nus-blue text-white ring-2 ring-nus-orange z-10"
                        : state === "week"
                          ? "bg-nus-blue/90 text-white hover:bg-nus-blue"
                          : "border border-dashed border-nus-blue/40 bg-nus-blue/5 text-nus-blue/70 hover:bg-nus-blue/10";
                    const selRing = isSel ? "z-10 ring-2 ring-nus-orange" : "";
                    const labelColor = solid ? "text-white/70" : "text-nus-blue/50";
                    return (
                      <button
                        key={`${s.start}-${s.module}-${i}`}
                        onClick={() => setSelected({ day, slot: s })}
                        title={`${s.module}${cls ? ` (${cls})` : ""} · ${formatTime(s.start)}–${formatTime(s.end)}${state === "reference" ? " · not on this week" : state === "live" ? " · on now" : ""}`}
                        aria-label={`${s.module} ${cls} from ${formatTime(s.start)} to ${formatTime(s.end)} on ${day}${state === "live" ? ", on now" : state === "reference" ? ", not on this week" : ""}`}
                        className={`absolute overflow-hidden rounded px-1 text-left font-mono text-[10px] leading-tight transition-shadow sm:text-xs ${base} ${selRing}`}
                        style={{
                          left: `${left}%`,
                          width: `calc(${width}% - 2px)`,
                          top: `calc(${(lane / lanes) * 100}% + 3px)`,
                          height: `calc(${100 / lanes}% - 6px)`,
                        }}
                      >
                        {lanes === 1 ? (
                          <>
                            <span className="block truncate">{s.module}</span>
                            {classLabel(s) && (
                              <span className={`block truncate text-[8px] sm:text-[10px] ${labelColor}`}>
                                {classLabel(s)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="block truncate">
                            {s.module}
                            {classLabel(s) && (
                              <span className={labelColor}> · {classLabel(s)}</span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Now line */}
                  {isToday && showNow && (
                    <span
                      className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-nus-orange"
                      style={{ left: `${pct(nowMin)}%` }}
                    >
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-nus-orange px-1 py-0.5 text-[8px] font-semibold leading-none text-white shadow-sm">
                        {nowLabel}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected block detail — sticky to the bottom of the modal's scroll
          viewport so it's visible immediately on tap without scrolling,
          matching the mobile experience where shorter content already fits. */}
      {selected && (
        <div className="sticky bottom-0 z-40 -mx-5 -mb-5 border-t border-zinc-200 bg-white/95 px-5 pb-3 pt-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-semibold text-nus-blue">
              {selected.slot.module}
            </span>
            {classLabelFull(selected.slot) && (
              <span className="rounded-full bg-nus-blue/10 px-2 py-0.5 text-[10px] font-medium text-nus-blue">
                {classLabelFull(selected.slot)}
              </span>
            )}
            <span className="text-zinc-500">
              {DAY_SHORT[selected.day]} · {formatTime(selected.slot.start)}–
              {formatTime(selected.slot.end)}
            </span>
            {selected.slot.weeks.length > 0 ? (
              <span className="ml-auto text-zinc-400">
                Weeks {formatWeeks(selected.slot.weeks)}
              </span>
            ) : selected.slot.dates && selected.slot.dates.length > 0 ? (
              <span className="ml-auto text-zinc-400">
                {formatDates(selected.slot.dates)}
              </span>
            ) : null}
            <button
              onClick={() => setSelected(null)}
              aria-label="Close class details"
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
