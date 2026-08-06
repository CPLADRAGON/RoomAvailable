"use client";

import type { OccupancyInfo } from "@/types";
import { formatTime } from "@/lib/occupancy-engine";

const TEXT: Record<string, string> = {
  vacant: "text-emerald-600",
  occupied: "text-red-500",
  crunch: "text-amber-600",
};

const DOTS: Record<string, string> = {
  vacant: "bg-status-vacant",
  occupied: "bg-status-occupied",
  crunch: "bg-status-crunch",
};

const RING: Record<string, string> = {
  vacant: "shadow-[0_0_0_3px_rgba(16,185,129,0.16)]",
  occupied: "shadow-[0_0_0_3px_rgba(239,68,68,0.16)]",
  crunch: "shadow-[0_0_0_3px_rgba(245,158,11,0.16)]",
};

export default function StatusBadge({ info }: { info: OccupancyInfo }) {
  const text = TEXT[info.status];
  const dot = DOTS[info.status];
  const ring = RING[info.status];

  let label: string;
  if (info.status === "vacant" && info.nextClass) {
    label = `VACANT UNTIL ${formatTime(info.nextClass.start)}`;
  } else if (info.status === "vacant") {
    label = "VACANT";
  } else if (info.status === "crunch") {
    label = "CRUNCH HOUR";
  } else {
    label = "OCCUPIED";
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${dot} ${ring}`} />
      <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${text}`}>
        {label}
      </span>
    </span>
  );
}
