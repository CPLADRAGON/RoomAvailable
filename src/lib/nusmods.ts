import type { VenueEntry, TimetableSlot, VenueMatrix } from "@/types";
import { inferCluster, shouldSkipVenue } from "./cluster-rules";
import { classifyRoom } from "./room-classify";
import {
  buildCalendar,
  computeAcademicYearStart,
  type CalendarMap,
} from "./calendar";

const API_BASE = "https://api.nusmods.com/v2";
const VENUE_LOCATIONS_URL =
  "https://raw.githubusercontent.com/nusmodifications/nusmods/master/website/src/data/venues.json";

// Identify this app on outbound requests to NUSMods/GitHub as a courtesy to the
// API maintainers (responsible-use etiquette). Only takes effect server-side
// (in the daily cron); browsers treat User-Agent as a forbidden header and
// silently ignore it, so the Tier-1 client fallback is unaffected.
const REQUEST_HEADERS = {
  "User-Agent":
    "NUS-Vacansee/1.0 (+https://github.com/CPLADRAGON/nus-vacansee; independent student project)",
};

// --- Raw NUSMods venueInformation.json shapes ------------------------------

type RawWeeks =
  | number[]
  | { start: string; end: string }
  | { start: string; end: string; weeks: number[] }
  | { start: string; end: string; weekInterval: number };

interface RawClass {
  classNo?: string;
  startTime?: string;
  endTime?: string;
  day?: string;
  weeks?: RawWeeks;
  moduleCode?: string;
  lessonType?: string;
  size?: number;
}

interface RawDayInfo {
  day?: string;
  classes?: RawClass[];
}

type RawVenueInfo = Record<string, RawDayInfo[]>;

const DAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function weekNumberFromDate(dateISO: string, semStartISO: string): number {
  const d = new Date(dateISO).getTime();
  const s = new Date(semStartISO).getTime();
  return Math.max(1, Math.floor((d - s) / (7 * 86400000)) + 1);
}

// Flatten NUSMods' three `weeks` encodings into absolute week numbers.
function normalizeWeeks(weeks: RawWeeks | undefined, semStartISO: string): number[] {
  if (!weeks) return [];
  if (Array.isArray(weeks)) {
    return [...new Set(weeks.filter((w) => typeof w === "number"))].sort(
      (a, b) => a - b
    );
  }
  if ("weeks" in weeks && Array.isArray(weeks.weeks)) {
    return [...new Set(weeks.weeks.filter((w) => typeof w === "number"))].sort(
      (a, b) => a - b
    );
  }
  if ("weekInterval" in weeks && weeks.start && weeks.end) {
    const interval = Math.max(1, weeks.weekInterval || 1);
    const out: number[] = [];
    let cursor = new Date(weeks.start).getTime();
    const end = new Date(weeks.end).getTime();
    const step = interval * 7 * 86400000;
    while (cursor <= end) {
      out.push(
        weekNumberFromDate(new Date(cursor).toISOString().slice(0, 10), semStartISO)
      );
      cursor += step;
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  return [];
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Resolve special-term schedules into explicit occurrence dates (ISO). Special
// terms have no global teaching-week numbering, so classes are matched by the
// actual calendar dates they run. `start` is the first occurrence (already on
// the class's weekday); stepping by 7 days preserves the weekday.
function scheduleToDates(weeks: RawWeeks | undefined): string[] {
  if (!weeks || Array.isArray(weeks)) return [];
  if (!weeks.start || !weeks.end) return [];
  const base = new Date(weeks.start).getTime();
  const end = new Date(weeks.end).getTime();
  const WEEK = 7 * 86400000;

  if ("weeks" in weeks && Array.isArray(weeks.weeks)) {
    return [
      ...new Set(
        weeks.weeks
          .filter((w) => typeof w === "number")
          .map((w) => isoDate(base + (w - 1) * WEEK))
      ),
    ].sort();
  }

  const step =
    "weekInterval" in weeks ? Math.max(1, weeks.weekInterval || 1) * WEEK : WEEK;
  const out: string[] = [];
  for (let cursor = base; cursor <= end; cursor += step) out.push(isoDate(cursor));
  return [...new Set(out)].sort();
}

// Semesters 1 & 2 use academic teaching weeks (unchanged). Special terms (3 & 4)
// use explicit occurrence dates.
function normalizeSchedule(
  weeks: RawWeeks | undefined,
  semester: number,
  semStartISO: string
): { weeks: number[]; dates: string[] } {
  if (semester === 3 || semester === 4) {
    return { weeks: [], dates: scheduleToDates(weeks) };
  }
  return { weeks: normalizeWeeks(weeks, semStartISO), dates: [] };
}

interface VenueMeta {
  lessonTypes: string[];
  maxSize: number;
}

function normalizeSemester(
  raw: RawVenueInfo,
  semester: number,
  semStartISO: string,
  out: Record<string, VenueEntry>,
  meta: Record<string, VenueMeta>
): void {
  for (const [venue, dayInfos] of Object.entries(raw)) {
    if (shouldSkipVenue(venue)) continue;
    if (!Array.isArray(dayInfos)) continue;

    for (const dayInfo of dayInfos) {
      const day = (dayInfo?.day || "").trim();
      if (!DAYS.has(day)) continue;

      for (const cls of dayInfo.classes || []) {
        const start = (cls.startTime || "").trim();
        const end = (cls.endTime || "").trim();
        const moduleCode = (cls.moduleCode || "").trim();
        const { weeks, dates } = normalizeSchedule(cls.weeks, semester, semStartISO);
        if (!start || !end || !moduleCode) continue;
        if (weeks.length === 0 && dates.length === 0) continue;

        const slot: TimetableSlot = {
          start,
          end,
          module: moduleCode,
          semester,
          weeks,
        };
        if (dates.length > 0) slot.dates = dates;
        const lessonType = (cls.lessonType || "").trim();
        const classNo = (cls.classNo || "").trim();
        if (lessonType) slot.lessonType = lessonType;
        if (classNo) slot.classNo = classNo;

        let entry = out[venue];
        if (!entry) {
          entry = { cluster: inferCluster(venue) };
          out[venue] = entry;
        }
        const arr = (entry as unknown as Record<string, TimetableSlot[]>)[day];
        if (arr) arr.push(slot);
        else (entry as unknown as Record<string, TimetableSlot[]>)[day] = [slot];

        // Accumulate room metadata for type/capacity inference.
        let m = meta[venue];
        if (!m) {
          m = { lessonTypes: [], maxSize: 0 };
          meta[venue] = m;
        }
        if (cls.lessonType) m.lessonTypes.push(cls.lessonType);
        if (typeof cls.size === "number" && cls.size > m.maxSize) {
          m.maxSize = cls.size;
        }
      }
    }
  }
}

async function fetchSemester(
  acadYear: string,
  semester: number
): Promise<RawVenueInfo> {
  const url = `${API_BASE}/${acadYear}/semesters/${semester}/venueInformation.json`;
  const res = await fetch(url, { cache: "no-store", headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`NUSMods HTTP ${res.status} (sem ${semester})`);
  return (await res.json()) as RawVenueInfo;
}

interface RawVenueLocation {
  roomName?: string;
  floor?: number;
  location?: { x?: number; y?: number };
}

interface VenueLocation {
  lat: number;
  lng: number;
  roomName?: string;
  floor?: number;
}

// NUSMods crowd-sourced per-venue coordinates (location.x = lng, location.y = lat).
async function fetchVenueLocations(): Promise<Record<string, VenueLocation>> {
  const out: Record<string, VenueLocation> = {};
  try {
    const res = await fetch(VENUE_LOCATIONS_URL, { headers: REQUEST_HEADERS });
    if (!res.ok) return out;
    const raw = (await res.json()) as Record<string, RawVenueLocation>;
    for (const [code, v] of Object.entries(raw)) {
      const loc = v?.location;
      if (loc && typeof loc.x === "number" && typeof loc.y === "number") {
        out[code.toUpperCase()] = {
          lat: loc.y,
          lng: loc.x,
          roomName: v.roomName,
          floor: v.floor,
        };
      }
    }
  } catch {
    /* locations are optional; ignore failures */
  }
  return out;
}

// Fetch + normalize both semesters into the app's VenueMatrix shape.
export async function fetchVenueData(
  today: Date = new Date()
): Promise<VenueMatrix> {
  const acadStart = computeAcademicYearStart(today);
  const acadYear = `${acadStart}-${acadStart + 1}`;
  const calendar: CalendarMap = buildCalendar(acadStart);
  const sems = calendar[acadYear];

  const [raw1, raw2, raw3, raw4, locations] = await Promise.all([
    fetchSemester(acadYear, 1).catch(() => ({}) as RawVenueInfo),
    fetchSemester(acadYear, 2).catch(() => ({}) as RawVenueInfo),
    fetchSemester(acadYear, 3).catch(() => ({}) as RawVenueInfo), // Special Term I
    fetchSemester(acadYear, 4).catch(() => ({}) as RawVenueInfo), // Special Term II
    fetchVenueLocations(),
  ]);

  if (
    Object.keys(raw1).length === 0 &&
    Object.keys(raw2).length === 0
  ) {
    throw new Error("NUSMods returned no venue data");
  }

  const venues: Record<string, VenueEntry> = {};
  const meta: Record<string, VenueMeta> = {};
  normalizeSemester(raw1, 1, sems["1"].start, venues, meta);
  normalizeSemester(raw2, 2, sems["2"].start, venues, meta);
  normalizeSemester(raw3, 3, "", venues, meta); // date-based; no semStart needed
  normalizeSemester(raw4, 4, "", venues, meta);

  // Sort each day's slots by start time for deterministic display.
  for (const entry of Object.values(venues)) {
    for (const [k, v] of Object.entries(entry)) {
      if (Array.isArray(v)) {
        (v as TimetableSlot[]).sort((a, b) => a.start.localeCompare(b.start));
      }
      void k;
    }
  }

  // Apply inferred room type + approximate capacity + venue coordinates.
  for (const [code, entry] of Object.entries(venues)) {
    const m = meta[code];
    if (m) {
      if (m.maxSize > 0) entry.capacity = m.maxSize;
      entry.type = classifyRoom(code, m.lessonTypes, m.maxSize);
    }
    const loc = locations[code.toUpperCase()];
    if (loc) {
      entry.lat = loc.lat;
      entry.lng = loc.lng;
      if (loc.roomName) entry.roomName = loc.roomName;
      if (typeof loc.floor === "number") entry.floor = loc.floor;
    }
  }

  const matrix: VenueMatrix = {
    _meta: {
      generated_at: new Date().toISOString(),
      academic_year: acadYear,
      venue_count: Object.keys(venues).length,
      module_count: 0,
    },
    _calendar: calendar,
  };
  Object.assign(matrix, venues);
  return matrix;
}

// Fetch the compacted snapshot our own daily cron maintains (see
// src/app/api/venues/route.ts and src/app/api/cron/refresh-venues/route.ts).
// This is the preferred data source: small, edge-cached, and doesn't hit
// NUSMods/GitHub from every visitor's browser. fetchVenueData() above remains
// as a resilience fallback if this route is ever unavailable.
export async function fetchCompactedSnapshot(): Promise<VenueMatrix> {
  const res = await fetch("/api/venues", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/venues HTTP ${res.status}`);
  return (await res.json()) as VenueMatrix;
}

