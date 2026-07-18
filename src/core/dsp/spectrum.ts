/**
 * Spectral estimation: single-frame amplitude spectrum, Welch PSD, and peak
 * picking. Amplitude and power are treated as distinct products because they
 * answer different questions — amplitude (in the signal's own units, e.g. mm/s)
 * for comparing a line against a vibration limit; power spectral density (units^2/Hz)
 * for characterising broadband content like cavitation, where the level depends on
 * bandwidth and must be normalised out.
 */

import { rfft, prevPowerOfTwo } from "./fft";
import { applyWindow, makeWindow, type Window, type WindowType } from "./window";

export interface Spectrum {
  /** Frequency of each bin, in Hz. */
  freqs: Float64Array;
  /** One-sided amplitude, corrected for window gain (signal units, peak). */
  amplitude: Float64Array;
  freqResolution: number;
  sampleRate: number;
}

export interface PSD {
  freqs: Float64Array;
  /** Power spectral density, signal_units^2 / Hz. */
  psd: Float64Array;
  freqResolution: number;
  sampleRate: number;
}

function makeFreqs(n: number, sampleRate: number): Float64Array {
  const half = (n >> 1) + 1;
  const freqs = new Float64Array(half);
  const df = sampleRate / n;
  for (let i = 0; i < half; i++) freqs[i] = i * df;
  return freqs;
}

/**
 * One-sided amplitude spectrum of a single frame. Values are peak amplitude in the
 * signal's units: a pure tone of amplitude A reads A at its line (within window
 * scalloping — use flat-top when that height must be exact).
 */
export function amplitudeSpectrum(
  frame: ArrayLike<number>,
  sampleRate: number,
  windowOrType: Window | WindowType = "hann",
): Spectrum {
  const n = frame.length;
  const window = typeof windowOrType === "string" ? makeWindow(windowOrType, n) : windowOrType;
  const windowed = applyWindow(frame, window);
  const { re, im } = rfft(windowed);
  const half = re.length;
  const amplitude = new Float64Array(half);
  const scale = 2 / (n * window.amplitudeGain);
  for (let i = 0; i < half; i++) {
    let a = Math.hypot(re[i], im[i]) * scale;
    // DC and Nyquist are not doubled (they have no negative-frequency twin).
    if (i === 0 || (n % 2 === 0 && i === half - 1)) a *= 0.5;
    amplitude[i] = a;
  }
  return { freqs: makeFreqs(n, sampleRate), amplitude, freqResolution: sampleRate / n, sampleRate };
}

/**
 * Welch power spectral density: average the periodograms of overlapping,
 * windowed segments. Overlap plus averaging trades a little frequency resolution
 * for a large drop in estimator variance — the difference between a jittery noise
 * floor you can't read and a smooth one where a small line stands out.
 */
export function welchPSD(
  signal: ArrayLike<number>,
  sampleRate: number,
  options: { segmentLength?: number; overlap?: number; windowType?: WindowType } = {},
): PSD {
  const nTotal = signal.length;
  const segLen = Math.min(options.segmentLength ?? 4096, prevPowerOfTwo(nTotal));
  const overlap = options.overlap ?? 0.5;
  const step = Math.max(1, Math.floor(segLen * (1 - overlap)));
  const window = makeWindow(options.windowType ?? "hann", segLen);
  const half = (segLen >> 1) + 1;
  const acc = new Float64Array(half);

  // Normalisation: divide by fs * Sum(w^2) so the result is a density in units^2/Hz.
  let winPower = 0;
  for (let i = 0; i < segLen; i++) winPower += window.weights[i] * window.weights[i];
  const norm = 1 / (sampleRate * winPower);

  const frame = new Float64Array(segLen);
  let segments = 0;
  for (let start = 0; start + segLen <= nTotal; start += step) {
    for (let i = 0; i < segLen; i++) frame[i] = signal[start + i] * window.weights[i];
    const { re, im } = rfft(frame);
    for (let i = 0; i < half; i++) {
      let p = (re[i] * re[i] + im[i] * im[i]) * norm;
      if (i !== 0 && !(segLen % 2 === 0 && i === half - 1)) p *= 2;
      acc[i] += p;
    }
    segments++;
  }
  if (segments === 0) {
    // Signal shorter than one segment: single periodogram over what we have.
    return welchPSD(signal, sampleRate, { ...options, segmentLength: prevPowerOfTwo(nTotal) });
  }
  for (let i = 0; i < half; i++) acc[i] /= segments;
  return { freqs: makeFreqs(segLen, sampleRate), psd: acc, freqResolution: sampleRate / segLen, sampleRate };
}

export interface Peak {
  freq: number;
  amplitude: number;
  index: number;
}

/**
 * Pick spectral peaks by local maxima above a prominence threshold, with
 * parabolic interpolation to refine each peak's frequency to sub-bin accuracy —
 * a peak sitting between two bins would otherwise be misread by up to half a bin,
 * enough to confuse a bearing line with its neighbour.
 */
export function findPeaks(
  freqs: ArrayLike<number>,
  amplitude: ArrayLike<number>,
  options: { minProminence?: number; count?: number; minFreq?: number } = {},
): Peak[] {
  const n = amplitude.length;
  const minFreq = options.minFreq ?? 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += amplitude[i];
  mean /= n;
  const threshold = options.minProminence ?? mean * 3;

  const peaks: Peak[] = [];
  for (let i = 1; i < n - 1; i++) {
    const a = amplitude[i];
    if (a <= amplitude[i - 1] || a < amplitude[i + 1] || a < threshold) continue;
    if (freqs[i] < minFreq) continue;
    const left = amplitude[i - 1];
    const right = amplitude[i + 1];
    const denom = left - 2 * a + right;
    const delta = denom !== 0 ? (0.5 * (left - right)) / denom : 0;
    const df = (freqs[1] as number) - (freqs[0] as number);
    peaks.push({
      freq: freqs[i] + delta * df,
      amplitude: a - 0.25 * (left - right) * delta,
      index: i,
    });
  }
  peaks.sort((p, q) => q.amplitude - p.amplitude);
  return options.count ? peaks.slice(0, options.count) : peaks;
}

/**
 * Integrated RMS over a frequency band from a PSD, via the trapezoidal rule.
 * This is how a band-limited overall level (e.g. ISO 10–1000 Hz velocity RMS)
 * is computed — integrate the density across the band and take the square root.
 */
export function bandRMS(psd: PSD, fLow: number, fHigh: number): number {
  const { freqs, psd: p } = psd;
  let power = 0;
  for (let i = 1; i < freqs.length; i++) {
    const f0 = freqs[i - 1];
    const f1 = freqs[i];
    if (f1 < fLow || f0 > fHigh) continue;
    const a = Math.max(f0, fLow);
    const b = Math.min(f1, fHigh);
    if (b <= a) continue;
    // Linear interpolation of the density at the (possibly clipped) band edges.
    const pa = p[i - 1] + ((p[i] - p[i - 1]) * (a - f0)) / (f1 - f0);
    const pb = p[i - 1] + ((p[i] - p[i - 1]) * (b - f0)) / (f1 - f0);
    power += 0.5 * (pa + pb) * (b - a);
  }
  return Math.sqrt(Math.max(0, power));
}
