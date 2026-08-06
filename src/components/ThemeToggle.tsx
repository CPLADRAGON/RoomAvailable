"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vacansee_theme";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));

    // While the user hasn't made an explicit choice, keep following the OS
    // setting live (e.g. an automatic day/night switch).
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return; // respect explicit choice
      applyTheme(e.matches);
      setDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-nus-blue hover:text-nus-blue"
    >
      {/* Render the icon only after mount so the SSR/client markup matches
          (the correct theme isn't known during SSR). */}
      {mounted &&
        (dark ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        ))}
    </button>
  );
}
