/**
 * Analytic signal and Hilbert transform via FFT.
 *
 * The analytic signal x_a(t) = x(t) + i·H{x(t)} has all negative-frequency content
 * removed. Its magnitude is the instantaneous envelope of the signal and its phase
 * derivative is the instantaneous frequency — both computed here without ever
 * forming an explicit Hilbert kernel, by zeroing the negative frequencies and
 * doubling the positive ones (Marple's method).
 */

import { fft, ifft } from "./fft";

export interface AnalyticSignal {
  re: Float64Array;
  im: Float64Array;
}

/** Analytic signal of a real input. re == input; im == Hilbert transform of input. */
export function analyticSignal(signal: ArrayLike<number>): AnalyticSignal {
  const n = signal.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  fft(re, im);

  // Build the one-sided spectral multiplier h and apply it in place.
  if (n % 2 === 0) {
    // h[0]=h[N/2]=1, h[1..N/2-1]=2, rest 0.
    for (let i = 1; i < n / 2; i++) {
      re[i] *= 2;
      im[i] *= 2;
    }
    for (let i = n / 2 + 1; i < n; i++) {
      re[i] = 0;
      im[i] = 0;
    }
  } else {
    for (let i = 1; i < (n + 1) / 2; i++) {
      re[i] *= 2;
      im[i] *= 2;
    }
    for (let i = (n + 1) / 2; i < n; i++) {
      re[i] = 0;
      im[i] = 0;
    }
  }

  ifft(re, im);
  return { re, im };
}

/** Instantaneous amplitude envelope |x_a(t)|. */
export function envelope(signal: ArrayLike<number>): Float64Array {
  const { re, im } = analyticSignal(signal);
  const n = re.length;
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.hypot(re[i], im[i]);
  return env;
}

/** Instantaneous phase (unwrapped) of the analytic signal. */
export function instantaneousPhase(analytic: AnalyticSignal): Float64Array {
  const { re, im } = analytic;
  const n = re.length;
  const phase = new Float64Array(n);
  let prev = 0;
  let offset = 0;
  for (let i = 0; i < n; i++) {
    const raw = Math.atan2(im[i], re[i]);
    if (i > 0) {
      const d = raw - prev;
      if (d > Math.PI) offset -= 2 * Math.PI;
      else if (d < -Math.PI) offset += 2 * Math.PI;
    }
    phase[i] = raw + offset;
    prev = raw;
  }
  return phase;
}

/**
 * Instantaneous frequency in Hz, from the derivative of the unwrapped phase.
 * Underpins order tracking: this is how a tacho-less rotational speed is
 * recovered from a strong 1x component.
 */
export function instantaneousFrequency(analytic: AnalyticSignal, sampleRate: number): Float64Array {
  const phase = instantaneousPhase(analytic);
  const n = phase.length;
  const freq = new Float64Array(n);
  const k = sampleRate / (2 * Math.PI);
  for (let i = 1; i < n - 1; i++) freq[i] = ((phase[i + 1] - phase[i - 1]) / 2) * k;
  if (n > 1) {
    freq[0] = (phase[1] - phase[0]) * k;
    freq[n - 1] = (phase[n - 1] - phase[n - 2]) * k;
  }
  return freq;
}
