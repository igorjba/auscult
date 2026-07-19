/*
 * Benchmarks the end-to-end analysis chain (FFT + Welch PSD + envelope Hilbert +
 * integration + rule engine + ISO severity) on synthetic bearing-fault records of
 * increasing length. Reports the median and p99 wall-clock per analyse() call.
 *
 * Usage: npx tsx scripts/bench.ts
 * Measures CPU cost of the DSP chain; excludes worker transfer and canvas rendering.
 */
import { generateSignal } from "../src/core/signal/generator";
import { analyze } from "../src/core/analyze";

const SAMPLE_RATE = 12000;
const RPM = 1797;
const RUNS = 40;
const WARMUP = 8;

// Record lengths spanning the realistic range: 1 s to 20 s at 12 kHz.
const LENGTHS = [12_000, 60_000, 120_000, 240_000];

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

console.log(`node ${process.version}  |  ${RUNS} runs/size after ${WARMUP} warmup  |  fs=${SAMPLE_RATE} Hz\n`);
console.log("samples   duration   median      p99");

for (const n of LENGTHS) {
  const duration = n / SAMPLE_RATE;
  const sig = generateSignal({
    fault: "bearing_outer",
    rpm: RPM,
    sampleRate: SAMPLE_RATE,
    duration,
    bearingDesignation: "6205-2RS JEM SKF",
    seed: 1,
  });
  const input = {
    samples: sig.samples,
    sampleRate: SAMPLE_RATE,
    rpm: RPM,
    unit: "acceleration" as const,
    accelInG: true,
    bearingDesignation: "6205-2RS JEM SKF",
  };

  for (let i = 0; i < WARMUP; i++) analyze(input);

  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    analyze(input);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);

  const median = percentile(times, 50);
  const p99 = percentile(times, 99);
  console.log(
    `${String(n).padStart(7)}   ${(`${duration}s`).padStart(6)}   ${median.toFixed(1).padStart(6)} ms   ${p99.toFixed(1).padStart(6)} ms`,
  );
}
