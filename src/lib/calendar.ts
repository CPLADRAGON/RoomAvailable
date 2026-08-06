import type { CalendarEntry } from "@/types";

// ---------------------------------------------------------------------------
// NUS academic calendar
//
// Ported from NUSMods' own `nusmoderator` package (MIT, by NUSModifications) so
// our semester/week detection matches NUSMods exactly — including recess,
// reading, examination and vacation weeks — instead of a rough heuristic.
//
// The academic year starts on the Monday on/after 1 August. Weeks are counted
// continuously from there: 1–23 = Semester 1, 24–40 = Semester 2,
// 41–46 = Special Term I, 47–52 = Special Term II.
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type CalendarMap = Record<
  string,
  Record<string, { start: string; end: string }>
>;

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun .. 6=Sat
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}

function addWeeks(d: Date, w: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + w * 7);
  return x;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday of the week containing 1 August (the first Monday on/after 1 Aug).
function getAcadYearStartDate(acadYear: string): Date {
  const yy = parseInt(acadYear.split("/")[0], 10);
  const year = 2000 + yy;
  const aug1 = new Date(year, 7, 1, 0, 0, 0, 0);
  const monday = startOfWeekMonday(aug1);
  return monday.getTime() < aug1.getTime() ? addWeeks(monday, 1) : monday;
}

function getAcadYear(date: Date): { year: string; startDate: Date } {
  const yy = date.getFullYear() % 100;
  const thisAy = `${yy}/${yy + 1}`;
  const start = getAcadYearStartDate(thisAy);
  const year = date.getTime() < start.getTime() ? `${yy - 1}/${yy}` : thisAy;
  return { year, startDate: getAcadYearStartDate(year) };
}

export function computeAcademicYearStart(today: Date = new Date()): number {
  const ay = getAcadYear(today).year; // e.g. "25/26"
  return 2000 + parseInt(ay.split("/")[0], 10);
}

export function getAcademicYearString(today: Date = new Date()): string {
  const start = computeAcademicYearStart(today);
  return `${start}-${start + 1}`;
}

type SemName =
  | "Semester 1"
  | "Semester 2"
  | "Special Term I"
  | "Special Term II"
  | null;

function getAcadSem(week: number): SemName {
  if (week < 1) return null;
  if (week <= 23) return "Semester 1";
  if (week <= 40) return "Semester 2";
  if (week <= 46) return "Special Term I";
  if (week <= 52) return "Special Term II";
  return null;
}

function getAcadWeekName(
  week: number
): { weekType: string; weekNumber: number | null } | null {
  switch (week) {
    case 7:
      return { weekType: "Recess", weekNumber: null };
    case 15:
      return { weekType: "Reading", weekNumber: null };
    case 16:
    case 17:
      return { weekType: "Examination", weekNumber: week - 15 };
    default: {
      if (week < 1 || week > 17) return null;
      let n = week;
      if (n >= 8) n -= 1; // skip the recess week in the count
      return { weekType: "Instructional", weekNumber: n };
    }
  }
}

export interface AcadWeekInfo {
  year: string;
  sem: SemName;
  type: string | null; // Instructional | Recess | Reading | Examination | Orientation | Vacation
  num: number | null;
}

export function getAcadWeekInfo(date: Date): AcadWeekInfo {
  const { year, startDate } = getAcadYear(date);
  const d = Math.ceil((date.getTime() - startDate.getTime() + 1) / WEEK_MS);
  const sem = getAcadSem(d);
  let type: string | null = null;
  let num: number | null = null;

  if (sem === "Semester 1" || sem === "Semester 2") {
    const d2 = sem === "Semester 2" ? d - 22 : d;
    if (d2 === 1) {
      type = "Orientation";
    } else if (d2 > 18) {
      type = "Vacation";
      num = d2 - 18;
    } else {
      const wn = getAcadWeekName(d2 - 1);
      if (wn) {
        type = wn.weekType;
        num = wn.weekNumber;
      }
    }
  } else if (sem === "Special Term I" || sem === "Special Term II") {
    const d2 = sem === "Special Term II" ? d - 6 : d;
    type = "Instructional";
    num = d2 - 40;
  } else if (d === 53) {
    type = "Vacation";
  }

  return { year, sem, type, num };
}

// ---------------------------------------------------------------------------
// App-facing helpers
// ---------------------------------------------------------------------------

// Accurate semester date ranges derived from the academic-year start.
export function buildCalendar(acadYearStart: number): CalendarMap {
  const acadYear = `${acadYearStart % 100}/${(acadYearStart % 100) + 1}`;
  const start = getAcadYearStartDate(acadYear);
  const s1 = addWeeks(start, 1); // instructional week 1 of Sem 1
  const s2 = addWeeks(start, 23); // instructional week 1 of Sem 2
  const key = `${acadYearStart}-${acadYearStart + 1}`;
  return {
    [key]: {
      "1": { start: toISODate(s1), end: toISODate(addWeeks(s1, 17)) },
      "2": { start: toISODate(s2), end: toISODate(addWeeks(s2, 17)) },
    },
  };
}

// The current teaching period as a semester number: 1/2 for regular semesters,
// 3 for Special Term I, 4 for Special Term II. Null only during pure vacation
// between academic years. Non-null throughout a semester's period (including
// recess / reading / exam weeks).
export function getCurrentSemester(now: Date = new Date()): CalendarEntry | null {
  const info = getAcadWeekInfo(now);
  const semester =
    info.sem === "Semester 1"
      ? 1
      : info.sem === "Semester 2"
        ? 2
        : info.sem === "Special Term I"
          ? 3
          : info.sem === "Special Term II"
            ? 4
            : null;
  if (!semester) return null;
  const acadStart = 2000 + parseInt(info.year.split("/")[0], 10);
  const academicYear = `${acadStart}-${acadStart + 1}`;
  if (semester === 3 || semester === 4) {
    // Special terms are matched by explicit dates, so the date range is unused.
    return { semester, start: "", end: "", academicYear };
  }
  const cal = buildCalendar(acadStart);
  const range = cal[academicYear][String(semester)];
  return {
    semester,
    start: range.start,
    end: range.end,
    academicYear,
  };
}

// The current instructional teaching week (1..13), or 0 when not in a teaching
// week (recess / reading / exam / vacation / special term). Returning 0 means
// `slot.weeks.includes(currentWeek)` matches nothing, so rooms read as free.
export function getCurrentWeek(now: Date = new Date()): number {
  const info = getAcadWeekInfo(now);
  if (
    info.type === "Instructional" &&
    info.sem !== "Special Term I" &&
    info.sem !== "Special Term II" &&
    info.num != null
  ) {
    return info.num;
  }
  return 0;
}

// Human-readable label for the current calendar period.
export function getPeriodLabel(now: Date = new Date()): string {
  const info = getAcadWeekInfo(now);
  if (info.sem === "Special Term I" || info.sem === "Special Term II") {
    return info.sem;
  }
  switch (info.type) {
    case "Instructional":
      return info.num != null ? `Week ${info.num}` : "Instructional week";
    case "Recess":
      return "Recess week";
    case "Reading":
      return "Reading week";
    case "Examination":
      return `Examination week ${info.num ?? ""}`.trim();
    case "Orientation":
      return "Orientation week";
    case "Vacation":
      return "Vacation";
    default:
      return "Vacation";
  }
}

// NUSMods-style persistent header summary, e.g. "AY2025/26 · Special Term II
// · Week 2", "AY2025/26 · Semester 1 · Recess week", or "AY2025/26 · Vacation".
// `short` produces a compact variant for narrow headers that drops the AY
// prefix entirely, e.g. "ST II · Wk 2".
export function getHeaderPeriodLabel(
  now: Date = new Date(),
  short = false
): string {
  const info = getAcadWeekInfo(now);
  const [yy1, yy2] = info.year.split("/");
  const ay = `AY20${yy1}/${yy2}`;

  const semPart = (() => {
    if (!short) return info.sem ?? "Vacation";
    switch (info.sem) {
      case "Semester 1":
        return "Sem 1";
      case "Semester 2":
        return "Sem 2";
      case "Special Term I":
        return "ST I";
      case "Special Term II":
        return "ST II";
      default:
        return "Vacation";
    }
  })();

  const periodPart = (() => {
    if (info.sem === "Special Term I" || info.sem === "Special Term II") {
      return info.num != null ? `${short ? "Wk" : "Week"} ${info.num}` : null;
    }
    switch (info.type) {
      case "Instructional":
        return info.num != null ? `${short ? "Wk" : "Week"} ${info.num}` : null;
      case "Recess":
        return short ? "Recess" : "Recess week";
      case "Reading":
        return short ? "Reading" : "Reading week";
      case "Examination":
        return `${short ? "Exam" : "Examination"} ${info.num ?? ""}`.trim();
      case "Orientation":
        return short ? "Orientation" : "Orientation week";
      default:
        return null;
    }
  })();

  if (short) {
    // Compact chip for narrow headers: no AY prefix, just sem + period.
    if (!info.sem) return "Vacation";
    return periodPart ? `${semPart} · ${periodPart}` : semPart;
  }

  if (!info.sem) return periodPart ? `${ay} · ${periodPart}` : ay;
  return periodPart ? `${ay} · ${semPart} · ${periodPart}` : `${ay} · ${semPart}`;
}
