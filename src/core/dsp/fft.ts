/**
 * Fast Fourier Transform.
 *
 * Two engines: an in-place radix-2 Cooley-Tukey for power-of-two lengths, and a
 * Bluestein (chirp-z) fallback for arbitrary lengths. Real acquisitions rarely
 * arrive as a clean 2^k number of samples, so the fallback matters — zero-padding
 * a vibration record to the next power of two smears the spectral lines.
 *
 * Data is carried as parallel Float64Array pairs (re, im) rather than an array of
 * objects: it keeps everything in a flat, cache-friendly buffer and avoids the
 * allocation churn that tanks FFT throughput in JS.
 */

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 1 << Math.ceil(Math.log2(n));
}

/** Largest power of two <= n. Used to pick the biggest radix-2 FFT that fits a record. */
export function prevPowerOfTwo(n: number): number {
  return n < 2 ? 1 : 1 << Math.floor(Math.log2(n));
}

/** In-place radix-2 FFT. `re`/`im` length must be a power of two. */
function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;

  // Decimation-in-time bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half];
        const bIm = im[i + k + half];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + half] = aRe - tRe;
        im[i + k + half] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * Bluestein's algorithm: expresses a DFT of arbitrary length N as a convolution
 * that can be evaluated with power-of-two FFTs. Cost is O(N log N) regardless of
 * whether N factors nicely.
 */
function fftBluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  const m = nextPowerOfTwo(2 * n - 1);

  // Chirp: exp(-i * pi * k^2 / n) for the forward transform.
  const sign = inverse ? 1 : -1;
  const wRe = new Float64Array(n);
  const wIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // (k^2 mod 2n) keeps the angle argument small so cos/sin stay accurate.
    const j = (k * k) % (2 * n);
    const ang = (sign * Math.PI * j) / n;
    wRe[k] = Math.cos(ang);
    wIm[k] = Math.sin(ang);
  }

  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    aRe[k] = re[k] * wRe[k] - im[k] * wIm[k];
    aIm[k] = re[k] * wIm[k] + im[k] * wRe[k];
  }

  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  bRe[0] = wRe[0];
  bIm[0] = -wIm[0];
  for (let k = 1; k < n; k++) {
    bRe[k] = bRe[m - k] = wRe[k];
    bIm[k] = bIm[m - k] = -wIm[k];
  }

  fftRadix2(aRe, aIm, false);
  fftRadix2(bRe, bIm, false);
  for (let k = 0; k < m; k++) {
    const xr = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    const xi = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = xr;
    aIm[k] = xi;
  }
  fftRadix2(aRe, aIm, true);

  for (let k = 0; k < n; k++) {
    const yr = aRe[k] * wRe[k] - aIm[k] * wIm[k];
    const yi = aRe[k] * wIm[k] + aIm[k] * wRe[k];
    re[k] = yr;
    im[k] = yi;
  }
  if (inverse) {
    for (let k = 0; k < n; k++) {
      re[k] /= n;
      im[k] /= n;
    }
  }
}

/** Forward FFT, in place. Dispatches to radix-2 or Bluestein by length. */
export function fft(re: Float64Array, im: Float64Array): void {
  if (re.length !== im.length) throw new Error("fft: re/im length mismatch");
  if (isPowerOfTwo(re.length)) fftRadix2(re, im, false);
  else fftBluestein(re, im, false);
}

/** Inverse FFT, in place (normalised by 1/N). */
export function ifft(re: Float64Array, im: Float64Array): void {
  if (re.length !== im.length) throw new Error("ifft: re/im length mismatch");
  if (isPowerOfTwo(re.length)) fftRadix2(re, im, true);
  else fftBluestein(re, im, true);
}

/**
 * FFT of a real-valued signal. Returns the non-redundant half-spectrum
 * (bins 0..N/2), which is all a one-sided magnitude/PSD estimate needs.
 */
export function rfft(signal: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = signal.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i];
  fft(re, im);
  const half = (n >> 1) + 1;
  return { re: re.slice(0, half), im: im.slice(0, half) };
}
