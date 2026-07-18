/**
 * Frequency-domain integration, acceleration -> velocity.
 *
 * Time-domain integration of a vibration record accumulates low-frequency drift
 * into a runaway ramp. Integrating in the frequency domain — dividing each spectral
 * line by j*omega — is numerically clean and lets a high-pass be applied in the same
 * pass, killing the near-DC content that carries no machine information but would
 * dominate an integrated waveform.
 */

import { fft, ifft, nextPowerOfTwo } from "./fft";

export interface IntegrateOptions {
  /** Reject content below this frequency (Hz) to suppress integration drift. */
  highpassHz?: number;
  /** Multiply the input by this before integrating (e.g. 9.80665 for g -> m/s^2). */
  inputScale?: number;
  /** Multiply the output by this (e.g. 1000 for m/s -> mm/s). */
  outputScale?: number;
}

export function integrateToVelocity(
  accel: ArrayLike<number>,
  sampleRate: number,
  options: IntegrateOptions = {},
): Float64Array {
  const { highpassHz = 2, inputScale = 1, outputScale = 1 } = options;
  const n = accel.length;
  const nfft = nextPowerOfTwo(n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = accel[i] * inputScale;

  fft(re, im);

  const df = sampleRate / nfft;
  for (let i = 0; i < nfft; i++) {
    const f = i <= nfft / 2 ? i * df : (i - nfft) * df;
    const af = Math.abs(f);
    if (af < highpassHz) {
      re[i] = 0;
      im[i] = 0;
      continue;
    }
    // Division by j*omega: V = A / (j*2*pi*f)  =>  multiply by 1/(j*omega) = -i/omega.
    const omega = 2 * Math.PI * f;
    const nr = im[i] / omega; // (a+bi)*(-i/omega) = b/omega - i*a/omega
    const ni = -re[i] / omega;
    re[i] = nr * outputScale;
    im[i] = ni * outputScale;
  }

  ifft(re, im);
  return re.slice(0, n);
}
