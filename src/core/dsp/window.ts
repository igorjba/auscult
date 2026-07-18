/**
 * Window functions and their amplitude/energy corrections.
 *
 * The choice of window is a real engineering decision, not a default. Hann is the
 * everyday workhorse — good frequency resolution, moderate leakage. Flat-top trades
 * resolution for amplitude accuracy and is the right pick when the number that
 * matters is the *height* of a line (e.g. reading a 1x amplitude against an ISO
 * limit), because it flattens the scalloping error to well under 1%. Rectangular
 * (no window) is only honest for exactly-periodic synthetic signals.
 */

export type WindowType = "rectangular" | "hann" | "hamming" | "blackmanharris" | "flattop";

export const WINDOW_LABELS: Record<WindowType, string> = {
  rectangular: "Retangular",
  hann: "Hann",
  hamming: "Hamming",
  blackmanharris: "Blackman-Harris",
  flattop: "Flat-top",
};

export interface Window {
  type: WindowType;
  weights: Float64Array;
  /** Sum(w)/N. Scale magnitude by 1/acg to recover true amplitude of a tone. */
  amplitudeGain: number;
  /** sqrt(Sum(w^2)/N). Scale by 1/ecg for correct power/PSD estimates. */
  energyGain: number;
  /** Equivalent noise bandwidth, in bins. Needed for PSD normalisation. */
  enbw: number;
}

function cosineWindow(n: number, coeffs: number[]): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < coeffs.length; k++) {
      v += (k % 2 === 0 ? 1 : -1) * coeffs[k] * Math.cos((2 * Math.PI * k * i) / (n - 1));
    }
    w[i] = v;
  }
  return w;
}

function build(type: WindowType, n: number): Float64Array {
  switch (type) {
    case "rectangular":
      return new Float64Array(n).fill(1);
    case "hann":
      return cosineWindow(n, [0.5, 0.5]);
    case "hamming":
      return cosineWindow(n, [0.54, 0.46]);
    case "blackmanharris":
      return cosineWindow(n, [0.35875, 0.48829, 0.14128, 0.01168]);
    case "flattop":
      // SRS flat-top coefficients: passband ripple < 0.01 dB.
      return cosineWindow(n, [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]);
  }
}

export function makeWindow(type: WindowType, n: number): Window {
  const weights = build(type, n);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sum += weights[i];
    sumSq += weights[i] * weights[i];
  }
  const amplitudeGain = sum / n;
  const energyGain = Math.sqrt(sumSq / n);
  const enbw = (n * sumSq) / (sum * sum);
  return { type, weights, amplitudeGain, energyGain, enbw };
}

/** Apply a window to a frame, writing into `out` (or a fresh buffer). */
export function applyWindow(frame: ArrayLike<number>, window: Window, out?: Float64Array): Float64Array {
  const n = frame.length;
  const dst = out ?? new Float64Array(n);
  const w = window.weights;
  for (let i = 0; i < n; i++) dst[i] = frame[i] * w[i];
  return dst;
}
