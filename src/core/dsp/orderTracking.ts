/**
 * Angular (order) resampling for variable-speed machines.
 *
 * When the shaft accelerates, a fixed defect *order* (say 3.58x for BPFO) sweeps
 * across many Hz bins during the record, so its energy smears and the Hz spectrum
 * turns to mush. The fix is to resample the signal at equal increments of shaft
 * angle instead of equal increments of time: in the angle domain every order is a
 * stationary line again, and an FFT yields a spectrum whose x-axis is orders of
 * running speed — independent of how the speed varied.
 *
 * The shaft phase can come from a tacho (an RPM profile) or, tacho-less, from the
 * instantaneous phase of the 1x component recovered by band-passing around the
 * running speed and taking its Hilbert phase.
 */

import { bandpass } from "./envelope";
import { analyticSignal, instantaneousPhase } from "./hilbert";
import { amplitudeSpectrum, type Spectrum } from "./spectrum";

/** Cumulative shaft phase (radians) for a linear run-up from rpmStart to rpmEnd. */
export function shaftPhaseLinear(rpmStart: number, rpmEnd: number, sampleRate: number, n: number): Float64Array {
  const phase = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const fr = (rpmStart + ((rpmEnd - rpmStart) * i) / n) / 60;
    acc += (2 * Math.PI * fr) / sampleRate;
    phase[i] = acc;
  }
  return phase;
}

/**
 * Tacho-less shaft phase: band-pass around the (approximate) running speed to
 * isolate the 1x line, then take the unwrapped Hilbert phase. Works whenever a
 * dominant 1x is present, which is the usual case for rotating machinery.
 */
export function estimateShaftPhase(signal: ArrayLike<number>, sampleRate: number, approxRpm: number): Float64Array {
  const fr = approxRpm / 60;
  const filtered = bandpass(signal, sampleRate, Math.max(1, fr * 0.7), fr * 1.4);
  return instantaneousPhase(analyticSignal(filtered));
}

export interface OrderResampleResult {
  /** Signal resampled onto equal shaft-angle steps. */
  samples: Float64Array;
  /** Samples per revolution — acts as the "sample rate" in the order domain. */
  samplesPerRev: number;
  revolutions: number;
}

/**
 * Resample `signal` from the time domain onto equal shaft-angle steps, given the
 * cumulative shaft phase per sample. Uses linear interpolation between the two time
 * samples that bracket each target angle.
 */
export function angularResample(
  signal: ArrayLike<number>,
  shaftPhase: Float64Array,
  samplesPerRev = 64,
): OrderResampleResult {
  const n = signal.length;
  const totalPhase = shaftPhase[n - 1] - shaftPhase[0];
  const revolutions = Math.floor(totalPhase / (2 * Math.PI));
  const dTheta = (2 * Math.PI) / samplesPerRev;
  const count = revolutions * samplesPerRev;
  const out = new Float64Array(count);

  let j = 0; // running index into the time samples
  const phase0 = shaftPhase[0];
  for (let k = 0; k < count; k++) {
    const targetPhase = phase0 + k * dTheta;
    while (j < n - 1 && shaftPhase[j + 1] < targetPhase) j++;
    if (j >= n - 1) {
      out[k] = signal[n - 1];
      continue;
    }
    const p0 = shaftPhase[j];
    const p1 = shaftPhase[j + 1];
    const frac = p1 > p0 ? (targetPhase - p0) / (p1 - p0) : 0;
    out[k] = signal[j] + frac * (signal[j + 1] - signal[j]);
  }
  return { samples: out, samplesPerRev, revolutions };
}

/**
 * Order spectrum: amplitude vs. orders of running speed. The returned `freqs` are
 * orders (1.0 = shaft rate, 3.58 = a 6205 BPFO), not Hz.
 */
export function orderSpectrum(resampled: OrderResampleResult): Spectrum {
  const spec = amplitudeSpectrum(resampled.samples, resampled.samplesPerRev, "hann");
  return spec; // sampleRate == samplesPerRev, so freqs are already in orders
}
