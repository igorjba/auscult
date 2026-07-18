import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Shared helpers for the canvas charts. Both the spectrum and waterfall need the
 * same three things: their live pixel width, the theme tokens resolved to concrete
 * colours (canvas can't read CSS variables), and consistent axis formatting.
 */

/** Track an element's content width via ResizeObserver. */
export function useElementWidth(defaultWidth = 600): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Read a CSS custom property off :root, with an SSR/empty fallback. */
export function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Resolve a `var(--token)` string to its concrete colour; pass through literals. */
export function resolveColor(c: string, fallback = "#0a8367"): string {
  if (!c.startsWith("var(")) return c;
  return readVar(c.slice(4, -1).trim(), fallback);
}

/** Format a frequency for an axis tick: 1.2k, 12k, 340, 5.0. */
export function formatHz(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k`;
  return f.toFixed(f < 10 ? 1 : 0);
}

/** #rrggbb + alpha → rgba() string, for canvas gradients. */
export function hexA(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const r = Number.parseInt(m.slice(0, 2), 16);
  const g = Number.parseInt(m.slice(2, 4), 16);
  const b = Number.parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
