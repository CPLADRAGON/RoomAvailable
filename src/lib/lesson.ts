import type { TimetableSlot } from "@/types";

// NUSMods' lesson-type abbreviations (e.g. Tutorial -> TUT), so a class reads
// like "TUT 25" — matching the "[T25]" markers students see for tutorial/lab
// groups on NUSMods and myEduRec.
const ABBREV: Record<string, string> = {
  "Design Lecture": "DLEC",
  Laboratory: "LAB",
  Lecture: "LEC",
  "Packaged Lecture": "PLEC",
  "Packaged Tutorial": "PTUT",
  Recitation: "REC",
  "Sectional Teaching": "SEC",
  "Seminar-Style Module Class": "SEM",
  Tutorial: "TUT",
  "Tutorial Type 2": "TUT2",
  "Tutorial Type 3": "TUT3",
  Workshop: "WS",
};

export function lessonAbbrev(type?: string): string {
  if (!type) return "";
  return ABBREV[type] ?? type;
}

// Short class label, e.g. "TUT 25", "LEC 1". Empty string when nothing is known.
export function classLabel(
  slot: Pick<TimetableSlot, "lessonType" | "classNo">
): string {
  const abbr = lessonAbbrev(slot.lessonType);
  if (abbr && slot.classNo) return `${abbr} ${slot.classNo}`;
  if (abbr) return abbr;
  return slot.classNo ?? "";
}

// Full readable class label, e.g. "Tutorial 25". Used for tooltips/detail.
export function classLabelFull(
  slot: Pick<TimetableSlot, "lessonType" | "classNo">
): string {
  if (slot.lessonType && slot.classNo) return `${slot.lessonType} ${slot.classNo}`;
  if (slot.lessonType) return slot.lessonType;
  return slot.classNo ?? "";
}
