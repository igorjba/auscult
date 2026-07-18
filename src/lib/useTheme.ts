"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "auscult-theme";

/**
 * Theme state. Light is the default; a saved choice in localStorage wins. The
 * `data-theme` attribute on <html> is what the token overrides key off, and an inline
 * script in the document head applies it before first paint to avoid a flash — this
 * hook only keeps React state in sync and persists changes.
 */
export function useTheme() {
  // Read the initial value from the attribute the head script already set (client
  // only). Doing it in the initializer avoids a state-sync effect and its cascading
  // render; the server always starts from "light" (the default).
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode / storage disabled — the in-page attribute still applies */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  return { theme, toggle };
}
