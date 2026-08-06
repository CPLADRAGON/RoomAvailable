"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vacansee_onboarded";

// One-time, first-run tip. Mount-gated (localStorage is client-only) so it
// never causes a hydration mismatch. Sets a flag on dismiss so it shows once.
export default function OnboardingTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      /* storage unavailable — just don't show it */
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;

  return (
    <div className="mb-4 rounded-lg border border-nus-blue/20 bg-nus-blue/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nus-blue/10 text-nus-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 21s-7-6.5-7-11a7 7 0 1114 0c0 4.5-7 11-7 11z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" fill="currentColor" />
            </svg>
          </span>
          <div>
            <p className="font-display text-sm font-bold tracking-[-0.01em] text-zinc-800">
              Welcome to NUS Vacansee
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">
              Tap <span className="font-medium text-nus-blue">Find rooms near me</span> to see
              vacant rooms ranked by nearness, or pick a faculty. Availability is computed from
              class timetables and may not reflect ad-hoc bookings — please verify on site.
            </p>
            <button
              onClick={dismiss}
              className="mt-3 rounded-md bg-nus-blue px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-nus-blue/90"
            >
              Got it
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
