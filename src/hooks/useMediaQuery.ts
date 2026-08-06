"use client";

import { useState, useEffect } from "react";

// Tracks whether the viewport matches a min-width media query (SSR-safe:
// starts false and syncs after mount so the server/client render matches).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
