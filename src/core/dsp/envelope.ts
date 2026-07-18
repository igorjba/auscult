/**
 * Envelope analysis — the single most important tool for catching an incipient
 * bearing fault.
 *
 * A spall on a raceway produces a train of short impacts. Each impact rings the
 * structure at its resonance (typically a few kHz), so in the raw spectrum the
 * fault energy is scattered around that high-frequency resonance and buried under
 * gear/shaft lines. The *repetition rate* of the impacts is the diagnostic quantity
 * (BPFO, BPFI, ...), and it lives at low frequency. Envelope analysis recovers it:
 *
 *   1. Band-pass around the resonance to isolate the ringing (reject shaft orders).
 *   2. Take the Hilbert envelope — demodulating the impact rate down to baseband.
 *   3. FFT the envelope. The bearing defect frequency now appears as a clean line.
 */

import { amplitudeSpectrum, type Spectrum } from "./spectrum";
import { envelope } from "./hilbert";
import { fft, ifft, nextPowerOfTwo } from "./fft";
import type { WindowType } from "./window";

/**
 * FFT-domain brick-wall band-pass. For envelope work the passband edges only need
 * to bracket the resonance, so a linear-phase brick-wall (which a time-domain IIR
 * can't give without distorting the impact timing) is exactly what's wanted.
 */
export function bandpass(
  signal: ArrayLike<number>,
  sampleRate: number,
  fLow: number,
  fHigh: number,
): Float64Array {
  const n = signal.length;
  const nfft = nextPowerOfTwo(n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  fft(re, im);
  const df = sampleRate / nfft;
  for (let i = 0; i < nfft; i++) {
    // Fold bin index to its physical frequency, including the negative half.
    const f = i <= nfft / 2 ? i * df : (i - nfft) * df;
    const af = Math.abs(f);
    if (af < fLow || af > fHigh) {
      re[i] = 0;
      im[i] = 0;
    }
  }
  ifft(re, im);
  return re.slice(0, n);
}

export interface EnvelopeResult {
  /** Time-domain envelope (band-limited). */
  envelope: Float64Array;
  /** Envelope spectrum — where BPFO/BPFI/BSF lines appear. */
  spectrum: Spectrum;
  band: [number, number];
  /**
   * Kurtosis of the band-passed signal. ~3 for Gaussian noise; a real bearing
   * spall drives it well above that. Acts as a physical gate: no impulsiveness in
   * the resonance band means no bearing fault, whatever a stray envelope line says.
   */
  impulsiveness: number;
}

/**
 * Full envelope pipeline. If a band is not supplied, one is chosen automatically
 * from the spectral kurtosis of a few candidate bands — the band whose band-passed
 * signal is the most impulsive is where the bearing rings. This is a compact
 * stand-in for the kurtogram and removes the main piece of expert guesswork.
 */
export function envelopeAnalysis(
  signal: ArrayLike<number>,
  sampleRate: number,
  options: { band?: [number, number]; windowType?: WindowType } = {},
): EnvelopeResult {
  const nyquist = sampleRate / 2;
  const band = options.band ?? selectResonanceBand(signal, sampleRate);
  const fLow = Math.max(1, band[0]);
  const fHigh = Math.min(nyquist * 0.98, band[1]);

  const filtered = bandpass(signal, sampleRate, fLow, fHigh);
  const impulsiveness = impulseKurtosis(filtered);
  const env = envelope(filtered);

  // Remove the DC term of the envelope: it is always the largest value and would
  // otherwise dominate bin 0 and dwarf the defect lines.
  let mean = 0;
  for (const v of env) mean += v;
  mean /= env.length;
  const centred = new Float64Array(env.length);
  for (let i = 0; i < env.length; i++) centred[i] = env[i] - mean;

  const spectrum = amplitudeSpectrum(centred, sampleRate, options.windowType ?? "hann");
  return { envelope: env, spectrum, band: [fLow, fHigh], impulsiveness };
}

/**
 * Pick the most impulsive frequency band by spectral kurtosis. Splits the band
 * above 500 Hz into overlapping candidates, band-passes each, and scores it by the
 * kurtosis of the band-passed signal (Gaussian noise ~3; repetitive impacts push
 * it higher). The winning band is where a bearing defect is ringing.
 *
 * A finer multi-scale kurtogram was tried and rejected: it neither recovered the
 * CWRU ball-defect case (whose energy simply does not concentrate on the BSF line
 * in any band) nor helped the synthetic set, where the narrow bands it favours
 * resolve the impact train less well than these half-octave-ish candidates.
 */
export function selectResonanceBand(signal: ArrayLike<number>, sampleRate: number): [number, number] {
  const nyquist = sampleRate / 2;
  const start = Math.min(500, nyquist * 0.2);
  const bandwidth = Math.max(500, (nyquist - start) / 6);
  let best: [number, number] = [start, Math.min(start + bandwidth, nyquist * 0.98)];
  let bestKurtosis = -Infinity;

  for (let fLow = start; fLow + bandwidth < nyquist; fLow += bandwidth / 2) {
    const fHigh = Math.min(fLow + bandwidth, nyquist * 0.98);
    const filtered = bandpass(signal, sampleRate, fLow, fHigh);
    const k = impulseKurtosis(filtered);
    if (k > bestKurtosis) {
      bestKurtosis = k;
      best = [fLow, fHigh];
    }
  }
  return best;
}

/**
 * Kurtosis of the central 90% of a band-passed signal. The FFT brick-wall filter
 * wraps the record end-to-start, and the resulting edge discontinuity (Gibbs)
 * produces spurious transients that inflate a naive kurtosis into the tens even for
 * pure noise. Trimming the edges before scoring restores ~3 for noise, so the value
 * is a trustworthy impulsiveness gate.
 */
export function impulseKurtosis(x: ArrayLike<number>): number {
  const n = x.length;
  const lo = Math.floor(n * 0.05);
  const hi = Math.ceil(n * 0.95);
  const core = new Float64Array(hi - lo);
  for (let i = lo; i < hi; i++) core[i - lo] = x[i];
  return kurtosis(core);
}

export function kurtosis(x: ArrayLike<number>): number {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
  }
  m2 /= n;
  m4 /= n;
  return m2 === 0 ? 0 : m4 / (m2 * m2);
}
