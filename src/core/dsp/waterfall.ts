/**
 * Short-time Fourier transform for waterfall and run-up cascade displays.
 *
 * A single spectrum assumes the machine's state is fixed. During a run-up it isn't:
 * resonances, orders and instabilities appear and move as speed changes. Slicing the
 * record into overlapping frames and stacking their spectra shows that evolution —
 * against time (waterfall) or against the shaft speed at each frame (cascade), which
 * is where a critical speed or an oil-whirl onset becomes visible.
 */

import { amplitudeSpectrum } from "./spectrum";
import type { WindowType } from "./window";

export interface Waterfall {
  /** Frame centre times, seconds. */
  times: Float64Array;
  freqs: Float64Array;
  /** magnitudes[frame][bin] amplitude. */
  magnitudes: Float64Array[];
  frameSize: number;
  maxAmplitude: number;
}

export function computeWaterfall(
  signal: ArrayLike<number>,
  sampleRate: number,
  options: { frameSize?: number; overlap?: number; windowType?: WindowType; maxFreq?: number } = {},
): Waterfall {
  const frameSize = options.frameSize ?? 2048;
  const overlap = options.overlap ?? 0.5;
  const step = Math.max(1, Math.floor(frameSize * (1 - overlap)));
  const windowType = options.windowType ?? "hann";
  const n = signal.length;

  const frame = new Float64Array(frameSize);
  const times: number[] = [];
  const magnitudes: Float64Array[] = [];
  let freqs = new Float64Array(0);
  let maxAmplitude = 0;
  let maxBin = -1;

  for (let start = 0; start + frameSize <= n; start += step) {
    for (let i = 0; i < frameSize; i++) frame[i] = signal[start + i];
    const spec = amplitudeSpectrum(frame, sampleRate, windowType);
    if (maxBin < 0) {
      if (options.maxFreq) {
        maxBin = spec.freqs.findIndex((f) => f > options.maxFreq!);
        if (maxBin < 0) maxBin = spec.freqs.length;
      } else {
        maxBin = spec.freqs.length;
      }
      freqs = spec.freqs.slice(0, maxBin);
    }
    const mag = spec.amplitude.slice(0, maxBin);
    for (let i = 0; i < mag.length; i++) if (mag[i] > maxAmplitude) maxAmplitude = mag[i];
    times.push((start + frameSize / 2) / sampleRate);
    magnitudes.push(mag);
  }

  return { times: Float64Array.from(times), freqs, magnitudes, frameSize, maxAmplitude };
}
