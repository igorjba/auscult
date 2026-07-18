"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./chart.module.css";

export interface Marker {
  freq: number;
  label: string;
  color?: string;
  dashed?: boolean;
}

interface Props {
  freqs: Float64Array;
  values: Float64Array;
  markers?: Marker[];
  color?: string;
  fill?: boolean;
  xMax?: number;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  height?: number;
}

/**
 * Amplitude-vs-frequency plot on a canvas. Draws the trace, a precise grid, defect
 * markers (BPFO/BPFI/…), and a crosshair readout on hover — the interaction a bench
 * analyser gives you when you drop a cursor on a line.
 */
export function SpectrumChart({
  freqs,
  values,
  markers = [],
  color = "var(--accent)",
  fill = true,
  xMax,
  xLabel = "Frequencia (Hz)",
  yLabel = "Amplitude",
  unit = "",
  height = 220,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; freq: number; amp: number } | null>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const padL = 52;
  const padR = 14;
  const padT = 14;
  const padB = 28;

  const fMax = xMax ?? freqs[freqs.length - 1] ?? 1;
  const nBins = freqs.length;
  const lastBin = (() => {
    let i = nBins - 1;
    while (i > 0 && freqs[i] > fMax) i--;
    return i;
  })();

  let vMax = 1e-9;
  for (let i = 0; i <= lastBin; i++) if (values[i] > vMax) vMax = values[i];
  vMax *= 1.12;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const xOf = (f: number) => padL + (f / fMax) * plotW;
    const yOf = (v: number) => padT + plotH - (v / vMax) * plotH;

    // Grid.
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.fillStyle = "#8a97a5";
    ctx.lineWidth = 1;
    ctx.font = "10px var(--font-geist-mono), monospace";
    ctx.textAlign = "center";
    const xTicks = 6;
    for (let t = 0; t <= xTicks; t++) {
      const f = (fMax * t) / xTicks;
      const x = xOf(f);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(formatHz(f), x, height - 10);
    }
    ctx.textAlign = "right";
    const yTicks = 4;
    for (let t = 0; t <= yTicks; t++) {
      const v = (vMax * t) / yTicks;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(formatAmp(v), padL - 8, y + 3);
    }

    // Markers.
    for (const m of markers) {
      if (m.freq > fMax || m.freq < 0) continue;
      const x = xOf(m.freq);
      const mc = m.color ?? "#e5a94e";
      ctx.strokeStyle = mc;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash(m.dashed ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = mc;
      ctx.textAlign = "center";
      ctx.font = "9.5px var(--font-geist-mono), monospace";
      ctx.fillText(m.label, x, padT + 9);
    }

    // Trace.
    const resolved = resolveColor(color);
    ctx.beginPath();
    for (let i = 0; i <= lastBin; i++) {
      const x = xOf(freqs[i]);
      const y = yOf(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (fill) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, hexA(resolved, 0.28));
      grad.addColorStop(1, hexA(resolved, 0.02));
      ctx.lineTo(xOf(freqs[lastBin]), padT + plotH);
      ctx.lineTo(xOf(freqs[0]), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i <= lastBin; i++) {
      const x = xOf(freqs[i]);
      const y = yOf(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = resolved;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Hover crosshair.
    if (hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padT);
      ctx.lineTo(hover.x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const y = yOf(hover.amp);
      ctx.fillStyle = resolved;
      ctx.beginPath();
      ctx.arc(hover.x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [freqs, values, markers, color, fill, width, height, fMax, vMax, lastBin, hover, padB]);

  function onMove(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotW = width - padL - padR;
    if (x < padL || x > padL + plotW) {
      setHover(null);
      return;
    }
    const f = ((x - padL) / plotW) * fMax;
    let i = Math.round((f / fMax) * lastBin);
    i = Math.max(0, Math.min(lastBin, i));
    setHover({ x: padL + (freqs[i] / fMax) * plotW, freq: freqs[i], amp: values[i] });
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.yaxis}>{yLabel}</div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div className={styles.readout}>
          <span className="mono">{formatHz(hover.freq)} Hz</span>
          <span className="mono" style={{ color: resolveColor(color) }}>
            {formatAmp(hover.amp)} {unit}
          </span>
        </div>
      )}
      <div className={styles.xaxis}>{xLabel}</div>
    </div>
  );
}

function formatHz(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k`;
  return f.toFixed(f < 10 ? 1 : 0);
}
function formatAmp(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}
function resolveColor(c: string): string {
  if (!c.startsWith("var(")) return c;
  const name = c.slice(4, -1).trim();
  if (typeof window === "undefined") return "#38d6b0";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#38d6b0";
}
function hexA(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
