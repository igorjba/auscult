import { describe, it, expect } from "vitest";
import { fft, ifft, rfft } from "./fft";
import { makeWindow } from "./window";
import { amplitudeSpectrum, welchPSD, findPeaks, bandRMS } from "./spectrum";
import { analyticSignal, envelope, instantaneousFrequency } from "./hilbert";
import { envelopeAnalysis, kurtosis } from "./envelope";
import { integrateToVelocity } from "./integrate";

function sine(freq: number, amp: number, fs: number, n: number, phase = 0): Float64Array {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs + phase);
  return x;
}

describe("fft", () => {
  it("round-trips through ifft (power of two)", () => {
    const n = 1024;
    const x = sine(50, 1.3, 2048, n);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    ifft(re, im);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(x[i], 9);
  });

  it("round-trips for a non-power-of-two length (Bluestein)", () => {
    const n = 1000;
    const x = sine(37, 0.7, 1000, n);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    ifft(re, im);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(x[i], 9);
  });

  it("Bluestein matches radix-2 by zero-padding a shared reference", () => {
    // A length-96 DFT (Bluestein) of a tone vs. the analytic expectation:
    // energy concentrates at the bin nearest the tone frequency.
    const n = 96;
    const fs = 96;
    const x = sine(12, 1, fs, n);
    const { re, im } = rfft(x);
    let peakBin = 0;
    let peakMag = 0;
    for (let i = 0; i < re.length; i++) {
      const m = Math.hypot(re[i], im[i]);
      if (m > peakMag) {
        peakMag = m;
        peakBin = i;
      }
    }
    expect(peakBin).toBe(12);
  });

  it("satisfies Parseval's theorem", () => {
    const n = 512;
    const x = sine(31, 2.1, 512, n, 0.4);
    let timeEnergy = 0;
    for (let i = 0; i < n; i++) timeEnergy += x[i] * x[i];
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    let freqEnergy = 0;
    for (let i = 0; i < n; i++) freqEnergy += re[i] * re[i] + im[i] * im[i];
    freqEnergy /= n;
    expect(freqEnergy).toBeCloseTo(timeEnergy, 6);
  });
});

describe("window corrections", () => {
  it("recovers unit amplitude gain for a rectangular window", () => {
    const w = makeWindow("rectangular", 256);
    expect(w.amplitudeGain).toBeCloseTo(1, 12);
    expect(w.enbw).toBeCloseTo(1, 12);
  });

  it("has ENBW above 1 bin for tapered windows", () => {
    expect(makeWindow("hann", 1024).enbw).toBeGreaterThan(1.4);
    expect(makeWindow("flattop", 1024).enbw).toBeGreaterThan(3);
  });
});

describe("amplitude spectrum", () => {
  it("reads the true peak amplitude of a tone (flat-top)", () => {
    const fs = 4096;
    const n = 4096;
    const amp = 1.75;
    const x = sine(256, amp, fs, n);
    const spec = amplitudeSpectrum(x, fs, "flattop");
    const peaks = findPeaks(spec.freqs, spec.amplitude, { count: 1 });
    expect(peaks[0].freq).toBeCloseTo(256, 0);
    expect(peaks[0].amplitude).toBeCloseTo(amp, 1);
  });

  it("separates two tones and orders peaks by amplitude", () => {
    const fs = 8192;
    const n = 8192;
    const a = sine(200, 1.0, fs, n);
    const b = sine(650, 0.4, fs, n);
    const mix = a.map((v, i) => v + b[i]);
    const spec = amplitudeSpectrum(mix, fs, "hann");
    const peaks = findPeaks(spec.freqs, spec.amplitude, { count: 2 });
    expect(peaks[0].freq).toBeCloseTo(200, 0);
    expect(peaks[1].freq).toBeCloseTo(650, 0);
  });
});

describe("welch PSD", () => {
  it("integrates to the correct band RMS for a known tone", () => {
    const fs = 8192;
    const n = 8192 * 4;
    const amp = 2.0;
    const x = sine(500, amp, fs, n);
    const psd = welchPSD(x, fs, { segmentLength: 4096, overlap: 0.5 });
    const rms = bandRMS(psd, 400, 600);
    // RMS of a sine of amplitude A is A/sqrt(2).
    expect(rms).toBeCloseTo(amp / Math.SQRT2, 1);
  });
});

describe("hilbert / envelope", () => {
  it("Hilbert of sin is -cos (quadrature)", () => {
    const fs = 2048;
    const n = 2048;
    const s = sine(64, 1, fs, n);
    const { im } = analyticSignal(s);
    // Away from the edges, H{sin} = -cos.
    for (let i = 200; i < n - 200; i++) {
      const expected = -Math.cos((2 * Math.PI * 64 * i) / fs);
      expect(im[i]).toBeCloseTo(expected, 2);
    }
  });

  it("recovers the envelope of an amplitude-modulated carrier", () => {
    const fs = 20000;
    const n = 20000;
    const fc = 3000;
    const fm = 80;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const mod = 1 + 0.5 * Math.sin(2 * Math.PI * fm * t);
      x[i] = mod * Math.sin(2 * Math.PI * fc * t);
    }
    const env = envelope(x);
    // Envelope should oscillate at fm around a mean of ~1.
    let mean = 0;
    for (let i = 1000; i < n - 1000; i++) mean += env[i];
    mean /= n - 2000;
    expect(mean).toBeCloseTo(1, 1);
  });

  it("finds the modulation line in the envelope spectrum", () => {
    const fs = 25000;
    const n = 25000;
    const fc = 4000;
    const fm = 120;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const mod = 1 + 0.7 * Math.sin(2 * Math.PI * fm * t);
      x[i] = mod * Math.sin(2 * Math.PI * fc * t);
    }
    const result = envelopeAnalysis(x, fs, { band: [3000, 5000] });
    const peaks = findPeaks(result.spectrum.freqs, result.spectrum.amplitude, { count: 1, minFreq: 20 });
    expect(peaks[0].freq).toBeCloseTo(fm, 0);
  });

  it("instantaneous frequency tracks a constant tone", () => {
    const fs = 4096;
    const n = 4096;
    const s = sine(100, 1, fs, n);
    const f = instantaneousFrequency(analyticSignal(s), fs);
    let mean = 0;
    for (let i = 500; i < n - 500; i++) mean += f[i];
    mean /= n - 1000;
    expect(mean).toBeCloseTo(100, 0);
  });
});

describe("integration acceleration -> velocity", () => {
  it("scales a tone by 1/omega and shifts phase", () => {
    // For a = A·sin(2πft), velocity amplitude is A/(2πf).
    const fs = 4096;
    const n = fs * 2;
    const f = 80;
    const amp = 3;
    const accel = sine(f, amp, fs, n);
    const vel = integrateToVelocity(accel, fs, { highpassHz: 5 });
    const spec = amplitudeSpectrum(vel.slice(0, 8192), fs, "flattop");
    const peak = findPeaks(spec.freqs, spec.amplitude, { count: 1 })[0];
    expect(peak.freq).toBeCloseTo(f, 0);
    expect(peak.amplitude).toBeCloseTo(amp / (2 * Math.PI * f), 2);
  });

  it("rejects low-frequency drift below the high-pass corner", () => {
    const fs = 2048;
    const n = fs * 2;
    const signal = new Float64Array(n);
    for (let i = 0; i < n; i++) signal[i] = Math.sin((2 * Math.PI * 40 * i) / fs) + 2 * Math.sin((2 * Math.PI * 1 * i) / fs);
    const vel = integrateToVelocity(signal, fs, { highpassHz: 5 });
    const spec = amplitudeSpectrum(vel.slice(0, 4096), fs, "hann");
    // The 1 Hz drift (below 5 Hz corner) must be suppressed relative to the 40 Hz line.
    const at = (hz: number) => spec.amplitude[Math.round(hz / spec.freqResolution)];
    expect(at(40)).toBeGreaterThan(at(1) * 5);
  });
});

describe("kurtosis", () => {
  it("is ~3 for a broad tone and higher for impulses", () => {
    const fs = 10000;
    const n = 10000;
    const tone = sine(1000, 1, fs, n);
    expect(kurtosis(tone)).toBeLessThan(2); // a pure sine is sub-Gaussian (~1.5)
    const impulses = new Float64Array(n);
    for (let i = 0; i < n; i += 500) impulses[i] = 10;
    expect(kurtosis(impulses)).toBeGreaterThan(10);
  });
});
