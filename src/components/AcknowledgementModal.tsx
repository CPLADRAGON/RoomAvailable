"use client";

import { useModalA11y } from "@/hooks/useModalA11y";

const PROFILE_URL = "https://github.com/CPLADRAGON";
const REPO_URL = "https://github.com/CPLADRAGON/nus-vacansee";

interface Credit {
  name: string;
  href: string;
  note: string;
}

const CREDITS: Credit[] = [
  {
    name: "NUSMods",
    href: "https://nusmods.com",
    note: "Timetable & venue availability data (MIT-licensed public API).",
  },
  {
    name: "nusmoderator",
    href: "https://github.com/nusmodifications/nusmods/tree/master/packages/nusmoderator",
    note: "NUS academic-calendar logic, ported for teaching-week detection (MIT).",
  },
  {
    name: "OneMap / Singapore Land Authority",
    href: "https://www.onemap.gov.sg/",
    note: "Map tiles used for venue locations and directions.",
  },
];

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.34 9.34 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0022 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

export default function AcknowledgementModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Acknowledgements"
        tabIndex={-1}
        className="glass max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-nus-blue">Acknowledgements</h2>
            <p className="text-xs text-zinc-500">
              About this project and the data that powers it.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Author */}
        <div className="rounded-xl border border-nus-blue/15 bg-nus-blue/5 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-1.5 rounded-full bg-nus-orange" />
            <p className="text-sm font-semibold text-nus-blue">
              Built by WANG BOYU
            </p>
          </div>
          <p className="mt-0.5 pl-3.5 text-xs text-zinc-500">NUS Student</p>
          <div className="mt-3 flex flex-wrap gap-2 pl-3.5">
            <a
              href={PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-nus-blue/40 px-3 py-1.5 text-xs font-medium text-nus-blue transition-colors hover:bg-nus-blue/10"
            >
              <GitHubIcon />
              GitHub profile
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-nus-blue/40 px-3 py-1.5 text-xs font-medium text-nus-blue transition-colors hover:bg-nus-blue/10"
            >
              <GitHubIcon />
              Source code
            </a>
          </div>
        </div>

        {/* Credits */}
        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Data & sources
        </h3>
        <ul className="space-y-3">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-nus-blue underline decoration-nus-blue/30 underline-offset-2 hover:decoration-nus-blue"
              >
                {c.name}
              </a>
              <p className="text-xs text-zinc-500">{c.note}</p>
            </li>
          ))}
        </ul>

        {/* Disclaimer */}
        <p className="mt-5 border-t border-zinc-200/60 pt-3 text-[11px] leading-relaxed text-zinc-400">
          This project is independent and <strong>not affiliated with NUS</strong> or
          NUSMods. Room availability is computed from published class schedules and
          may not reflect ad-hoc bookings or exams — please verify on site.
        </p>
      </div>
    </div>
  );
}
