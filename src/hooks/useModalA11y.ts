"use client";

import { useEffect, useRef } from "react";

// Shared modal accessibility: focus management + focus trap + Escape-to-close.
// Attach the returned ref to the modal's content container (the element that
// should hold focus), and give that element role="dialog" aria-modal="true".
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Keep the latest onClose without re-running the effect (which would steal
  // focus back to the top on every parent re-render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        : [];

    // Move focus into the dialog on open.
    const first = focusable()[0];
    (first ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === firstEl || active === node)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever opened the dialog.
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}
