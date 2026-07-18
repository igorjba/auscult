/**
 * Feature extraction from a computed spectrum and envelope spectrum. These are the
 * measurable quantities the rule engine reasons over — harmonic amplitudes at
 * shaft-rate multiples, subsynchronous content, broadband energy, and the strength
 * of bearing defect lines (with their sidebands) in the envelope spectrum.
 */

import type { Spectrum } from "../dsp";
import type { DefectFrequencies } from "../bearings";

/** Peak amplitude within +/- tolHz of a target frequency. */
export function amplitudeNear(spec: Spectrum, targetHz: number, tolHz: number): { amp: number; freq: number } {
  const { freqs, amplitude } = spec;
  let best = 0;
  let at = targetHz;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < targetHz - tolHz) continue;
    if (freqs[i] > targetHz + tolHz) break;
    if (amplitude[i] > best) {
      best = amplitude[i];
      at = freqs[i];
    }
  }
  return { amp: best, freq: at };
}

/** Median amplitude of a spectrum — a robust noise-floor reference. */
export function medianAmplitude(spec: Spectrum): number {
  const a = Array.from(spec.amplitude).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)] || 1e-12;
}

/**
 * Robust noise-floor estimate: the mean of the lower 80% of bins, which excludes
 * the discrete lines and estimates the continuum they stand on. A plain median can
 * collapse to ~0 in a sparse envelope spectrum and make every stray peak look
 * infinitely prominent, so line prominence is measured against this instead.
 */
export function noiseFloor(spec: Spectrum): number {
  const a = Array.from(spec.amplitude).sort((x, y) => x - y);
  const cut = Math.max(1, Math.floor(a.length * 0.8));
  let sum = 0;
  for (let i = 0; i < cut; i++) sum += a[i];
  return sum / cut || 1e-12;
}

export interface HarmonicProfile {
  shaftRate: number;
  /** Amplitudes at 1x..maxOrder, indexed [0] = 1x. */
  harmonics: number[];
  /** Strongest subsynchronous amplitude in (0, 0.9x) and its order. */
  subsync: { amp: number; order: number };
  floor: number;
}

export function harmonicProfile(spec: Spectrum, shaftRate: number, maxOrder = 8): HarmonicProfile {
  const tol = Math.max(spec.freqResolution * 2, shaftRate * 0.04);
  const harmonics: number[] = [];
  for (let k = 1; k <= maxOrder; k++) harmonics.push(amplitudeNear(spec, k * shaftRate, tol).amp);

  // Subsynchronous scan over 0.35x–0.9x: brackets oil whirl (0.42–0.48x) and the
  // looseness half-order (0.5x) while skipping both the near-1x skirt and the
  // low-frequency residue from the velocity high-pass.
  let subAmp = 0;
  let subOrder = 0;
  const df = spec.freqResolution;
  for (let f = 0.35 * shaftRate; f < 0.9 * shaftRate; f += df) {
    const { amp } = amplitudeNear(spec, f, df);
    if (amp > subAmp) {
      subAmp = amp;
      subOrder = f / shaftRate;
    }
  }
  return { shaftRate, harmonics, subsync: { amp: subAmp, order: subOrder }, floor: medianAmplitude(spec) };
}

/** Fraction of total spectral energy that falls in a broadband window. */
export function broadbandRatio(spec: Spectrum, fLow: number, fHigh: number): number {
  let band = 0;
  let total = 0;
  for (let i = 0; i < spec.freqs.length; i++) {
    const p = spec.amplitude[i] * spec.amplitude[i];
    total += p;
    if (spec.freqs[i] >= fLow && spec.freqs[i] <= fHigh) band += p;
  }
  return total > 0 ? band / total : 0;
}

/**
 * Peakiness: how much a discrete line stands above the local continuum. Cavitation
 * has a high broadband ratio *and* low peakiness (no lines); a resonance has both
 * high. This separates the two.
 */
export function spectralFlatness(spec: Spectrum, fLow: number, fHigh: number): number {
  let logSum = 0;
  let linSum = 0;
  let count = 0;
  for (let i = 0; i < spec.freqs.length; i++) {
    if (spec.freqs[i] < fLow || spec.freqs[i] > fHigh) continue;
    const v = spec.amplitude[i] + 1e-12;
    logSum += Math.log(v);
    linSum += v;
    count++;
  }
  if (count === 0) return 0;
  const geoMean = Math.exp(logSum / count);
  const arithMean = linSum / count;
  return arithMean > 0 ? geoMean / arithMean : 0; // ~1 = flat/noise-like, ~0 = peaky
}

export interface BearingEvidence {
  name: "BPFO" | "BPFI" | "BSF";
  targetHz: number;
  amp: number;
  foundHz: number;
  /** Amplitude ratio of the line above the envelope-spectrum floor. */
  prominence: number;
  /** Number of detectable harmonics of the defect line. */
  harmonics: number;
  /** Sideband strength (relative to the central line), 0 if none. */
  sidebandRatio: number;
}

/**
 * Score each bearing defect frequency in the envelope spectrum: line prominence,
 * how many harmonics repeat, and the sideband ratio (1x spacing for BPFI, cage
 * spacing for BSF) — the sidebands are what distinguish a genuine race/ball fault
 * from a coincidental line.
 */
export function bearingEvidence(env: Spectrum, defects: DefectFrequencies): BearingEvidence[] {
  const floor = noiseFloor(env);
  const tol = Math.max(env.freqResolution * 2, defects.shaftRate * 0.05);
  const specs: { name: BearingEvidence["name"]; hz: number; sideband: number }[] = [
    { name: "BPFO", hz: defects.bpfo, sideband: 0 },
    { name: "BPFI", hz: defects.bpfi, sideband: defects.shaftRate },
    { name: "BSF", hz: defects.bsf, sideband: defects.ftf },
  ];

  return specs.map(({ name, hz, sideband }) => {
    const fundamental = amplitudeNear(env, hz, tol);
    // A harmonic only counts if it is a genuine local maximum well above the floor.
    // The lenient "3x floor" test used to score 4/4 on pure noise; requiring a local
    // peak at 8x floor makes the harmonic count actually mean something.
    let harmonics = 0;
    for (let k = 1; k <= 5; k++) {
      const h = amplitudeNear(env, k * hz, tol);
      if (h.amp > floor * 8) harmonics++;
    }
    let sidebandRatio = 0;
    if (sideband > 0 && fundamental.amp > 0) {
      const lo = amplitudeNear(env, hz - sideband, tol).amp;
      const hi = amplitudeNear(env, hz + sideband, tol).amp;
      sidebandRatio = Math.max(lo, hi) / fundamental.amp;
    }
    return {
      name,
      targetHz: hz,
      amp: fundamental.amp,
      foundHz: fundamental.freq,
      prominence: fundamental.amp / floor,
      harmonics,
      sidebandRatio,
    };
  });
}
