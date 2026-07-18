import { describe, it, expect } from "vitest";
import { shaftPhaseLinear, estimateShaftPhase, angularResample, orderSpectrum } from "./orderTracking";
import { amplitudeSpectrum, findPeaks } from "./index";

/**
 * Order tracking must turn a smeared run-up into a clean order line. These build a
 * signal whose component sits at a fixed *order* of a shaft that accelerates, then
 * check that the order spectrum resolves that order sharply — the whole point of
 * angular resampling.
 */
describe("angular resampling / order spectrum", () => {
  const fs = 4096;
  const n = fs * 2; // 2 s
  const rpmStart = 600; // 10 Hz
  const rpmEnd = 1800; // 30 Hz

  function runUpAtOrder(order: number): Float64Array {
    const phase = shaftPhaseLinear(rpmStart, rpmEnd, fs, n);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(order * phase[i]);
    return x;
  }

  it("recovers a fixed order from a variable-speed record", () => {
    const order = 3.5;
    const x = runUpAtOrder(order);
    const phase = shaftPhaseLinear(rpmStart, rpmEnd, fs, n);
    const resampled = angularResample(x, phase, 64);
    const spec = orderSpectrum(resampled);
    const peak = findPeaks(spec.freqs, spec.amplitude, { count: 1, minFreq: 0.5 })[0];
    expect(peak.freq).toBeCloseTo(order, 1); // x-axis is orders, not Hz
  });

  it("the same run-up smears across many Hz bins without tracking", () => {
    // Sanity check that the problem is real: in the Hz spectrum the energy spreads,
    // so no single bin holds the whole component.
    const x = runUpAtOrder(3.5);
    const spec = amplitudeSpectrum(x, fs, "hann");
    const orderPeak = orderSpectrum(angularResample(x, shaftPhaseLinear(rpmStart, rpmEnd, fs, n), 64));
    const maxHz = Math.max(...spec.amplitude);
    const maxOrder = Math.max(...orderPeak.amplitude);
    expect(maxOrder).toBeGreaterThan(maxHz * 2); // tracking concentrates the line
  });

  it("estimates shaft phase tacho-less from a dominant 1x", () => {
    // A strong 1x plus a smaller 2x; the estimator should lock to the 1x rate.
    const truePhase = shaftPhaseLinear(rpmStart, rpmEnd, fs, n);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(truePhase[i]) + 0.3 * Math.sin(2 * truePhase[i]);
    const estimated = estimateShaftPhase(x, fs, (rpmStart + rpmEnd) / 2);
    // Compare total phase advance over the middle of the record (edges are noisy).
    const a = Math.floor(n * 0.3);
    const b = Math.floor(n * 0.7);
    const estAdvance = estimated[b] - estimated[a];
    const trueAdvance = truePhase[b] - truePhase[a];
    expect(estAdvance / trueAdvance).toBeCloseTo(1, 1);
  });
});
