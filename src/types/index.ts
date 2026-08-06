import type { RoomType } from "@/lib/room-classify";

export interface TimetableSlot {
  start: string;
  end: string;
  module: string;
  semester: number;
  weeks: number[];
  // Special-term classes are scheduled by explicit calendar dates (ISO
  // YYYY-MM-DD) rather than academic teaching-week numbers. When present, the
  // occupancy engine matches on today's date instead of the teaching week.
  dates?: string[];
  lessonType?: string;
  classNo?: string;
}

export interface VenueDaySchedule {
  [day: string]: TimetableSlot[];
}

export interface VenueEntry {
  cluster: string;
  capacity?: number;
  type?: RoomType;
  lat?: number;
  lng?: number;
  roomName?: string;
  floor?: number;
  Monday?: TimetableSlot[];
  Tuesday?: TimetableSlot[];
  Wednesday?: TimetableSlot[];
  Thursday?: TimetableSlot[];
  Friday?: TimetableSlot[];
  Saturday?: TimetableSlot[];
}

export type OccupancyStatus = "vacant" | "occupied" | "crunch";

export interface OccupancyInfo {
  status: OccupancyStatus;
  currentModule?: string;
  currentClass?: string;
  until?: string;
  nextClass?: { start: string; module: string };
  // For vacant rooms: when the free block ends and how long it lasts (minutes).
  freeUntil?: string;
  freeMinutes?: number;
  // For occupied/crunch rooms: when the room next becomes free (after any
  // back-to-back classes) and how long that free block lasts. freeAt is absent
  // when the room stays booked until the end of the campus day.
  freeAt?: string;
  freeForMinutes?: number;
  // Trust/confidence signal: false when this venue has zero timetable entries
  // for today's weekday at all (no classes ever scheduled here on this day),
  // meaning "vacant" is a default rather than confirmed from a real schedule.
  // Undefined/true means we have real timetable data for today to compute from.
  hasScheduleToday?: boolean;
}

export interface VenueMatrix {
  _meta: {
    generated_at: string;
    academic_year: string;
    venue_count: number;
    module_count: number;
  };
  _calendar: Record<
    string,
    Record<string, { start: string; end: string }>
  >;
  [venue: string]: VenueEntry | any;
}

export interface ClusterInfo {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface CalendarEntry {
  semester: number;
  start: string;
  end: string;
  academicYear: string;
}
