"use client";

import { useEffect, useRef, useState } from "react";
import type { Waterfall } from "@/core/dsp";
import styles from "./chart.module.css";

interface Props {
  waterfall: Waterfall;
  height?: number;
  markers?: { freq: number; label: string; color?: string }[];
}

/**
 * Spectrogram of the run/record: frequency across, time down, amplitude as colour.
 * Rendered by filling an offscreen bitmap at native resolution (one texel per
 * bin/frame) and letting the GPU scale it — fast enough to repaint on resize.
 */
export function WaterfallChart({ waterfall, height = 240, markers = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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
  const padT = 10;
  const padB = 26;
  const fMax = waterfall.freqs[waterfall.freqs.length - 1] ?? 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const nFrames = waterfall.magnitudes.length;
    const nBins = waterfall.freqs.length;
    if (nFrames === 0 || nBins === 0) return;

    const off = document.createElement("canvas");
    off.width = nBins;
    off.height = nFrames;
    const octx = off.getContext("2d")!;
    const img = octx.createImageData(nBins, nFrames);
    const inv = 1 / (waterfall.maxAmplitude || 1);
    for (let f = 0; f < nFrames; f++) {
      const row = waterfall.magnitudes[f];
      for (let b = 0; b < nBins; b++) {
        // Mild gamma lifts the low-level detail (the noise-floor structure) so it is
        // not crushed to black next to a dominant line.
        const v = Math.pow(Math.min(1, row[b] * inv), 0.45);
        const [r, g, bl] = magma(v);
        const idx = (f * nBins + b) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = bl;
        img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, padL, padT, plotW, plotH);

    // Axes.
    ctx.fillStyle = "#5a6875";
    ctx.font = "10px var(--font-geist-mono), monospace";
    ctx.textAlign = "center";
    for (let t = 0; t <= 6; t++) {
      const f = (fMax * t) / 6;
      ctx.fillText(f >= 1000 ? `${(f / 1000).toFixed(1)}k` : f.toFixed(0), padL + (f / fMax) * plotW, height - 9);
    }
    ctx.textAlign = "right";
    const tMax = waterfall.times[waterfall.times.length - 1] ?? 1;
    for (let t = 0; t <= 4; t++) {
      const time = (tMax * t) / 4;
      ctx.fillText(`${time.toFixed(2)}s`, padL - 8, padT + (t / 4) * plotH + 3);
    }

    for (const m of markers) {
      if (m.freq > fMax) continue;
      const x = padL + (m.freq / fMax) * plotW;
      ctx.strokeStyle = m.color ?? "rgba(255,255,255,0.5)";
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }, [waterfall, width, height, fMax, markers]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.yaxis}>Tempo</div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} />
      <div className={styles.xaxis}>Frequencia (Hz)</div>
    </div>
  );
}

/** Compact magma-like colormap: dark purple -> red -> orange -> pale yellow. */
function magma(t: number): [number, number, number] {
  const stops: [number, number[]][] = [
    [0.0, [4, 4, 15]],
    [0.25, [58, 20, 90]],
    [0.5, [140, 40, 96]],
    [0.75, [222, 90, 70]],
    [0.9, [248, 160, 78]],
    [1.0, [252, 232, 180]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return [252, 232, 180];
}
