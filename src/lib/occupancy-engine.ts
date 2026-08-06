import type { VenueEntry, TimetableSlot, OccupancyInfo, CalendarEntry } from "@/types";
import { getCurrentWeek } from "./calendar";
import { classLabelFull } from "./lesson";

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function getSingaporeTime(): Date {
  const now = new Date();
  const sg = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  return new Date(sg);
}

export function formatTime(hhmm: string): string {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = hhmm.slice(2);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${m} ${ampm}`;
}

export function formatDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Compact "how long ago" label for a data-freshness timestamp (e.g. "5m ago",
// "2h ago", "just now"). Used to reassure users the venue data isn't stale.
export function formatRelativeTime(epochMs: number, now: Date = new Date()): string {
  const diffMs = now.getTime() - epochMs;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isCrunchHour(time: string): boolean {
  const t = parseInt(time, 10);
  return t >= 1200 && t <= 1400;
}

// Campus operating-day end used to bound an open-ended vacancy block.
const DAY_END = "2200";

function minutesBetween(fromHHMM: string, toHHMM: string): number {
  const fh = parseInt(fromHHMM.slice(0, 2), 10);
  const fm = parseInt(fromHHMM.slice(2), 10);
  const th = parseInt(toHHMM.slice(0, 2), 10);
  const tm = parseInt(toHHMM.slice(2), 10);
  return Math.max(0, th * 60 + tm - (fh * 60 + fm));
}

export function computeOccupancy(
  venue: VenueEntry,
  now: Date,
  semester: CalendarEntry | null
): OccupancyInfo {
  const currentTime =
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");

  if (!semester) {
    return {
      status: "vacant",
      freeUntil: DAY_END,
      freeMinutes: minutesBetween(
        currentTime < DAY_END ? currentTime : DAY_END,
        DAY_END
      ),
    };
  }

  const dayName = DAY_NAMES[now.getDay()];
  const currentWeek = getCurrentWeek(now);
  const todayISO =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");

  const slots = (venue as unknown as Record<string, TimetableSlot[] | undefined>)[dayName];

  const buildVacant = (
    activeSlots: TimetableSlot[],
    hasScheduleToday: boolean
  ): OccupancyInfo => {
    const nextClass = activeSlots
      .filter((s) => s.start > currentTime)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    const freeUntil = nextClass ? nextClass.start : DAY_END;
    return {
      status: "vacant",
      freeUntil,
      freeMinutes: minutesBetween(
        currentTime < DAY_END ? currentTime : DAY_END,
        freeUntil
      ),
      nextClass: nextClass
        ? { start: nextClass.start, module: nextClass.module }
        : undefined,
      hasScheduleToday,
    };
  };

  if (!slots || slots.length === 0) {
    // This venue has zero timetable entries for today's weekday at all (in
    // any semester) — "vacant" here is a default, not confirmed from a real
    // schedule. Surfaced to the UI as a lower-confidence signal.
    return buildVacant([], false);
  }

  const activeSlots = slots.filter((s) => {
    if (s.semester !== semester.semester) return false;
    // Special-term slots (sem 3/4) match by explicit occurrence date;
    // regular semesters (1/2) match by teaching week.
    if (s.dates && s.dates.length > 0) return s.dates.includes(todayISO);
    return s.weeks.includes(currentWeek);
  });

  for (const slot of activeSlots) {
    if (currentTime >= slot.start && currentTime < slot.end) {
      const status = isCrunchHour(currentTime) ? "crunch" : "occupied";
      // Chain any back-to-back / overlapping classes so "free at" reflects when
      // the room is *actually* free, not merely when this one class ends.
      let busyEnd = slot.end;
      let extended = true;
      while (extended) {
        extended = false;
        for (const s of activeSlots) {
          if (s.start <= busyEnd && s.end > busyEnd) {
            busyEnd = s.end;
            extended = true;
          }
        }
      }
      const nextAfter = activeSlots
        .filter((s) => s.start >= busyEnd)
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      const freeUntilNext = nextAfter ? nextAfter.start : DAY_END;
      const freeForMinutes = minutesBetween(busyEnd, freeUntilNext);
      return {
        status,
        currentModule: slot.module,
        currentClass: classLabelFull(slot) || undefined,
        until: slot.end,
        freeAt: busyEnd < DAY_END ? busyEnd : undefined,
        freeForMinutes: busyEnd < DAY_END ? freeForMinutes : undefined,
        hasScheduleToday: true,
      };
    }
  }

  return buildVacant(activeSlots, true);
}
