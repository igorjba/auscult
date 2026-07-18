/**
 * Synthetic vibration generator with injected faults.
 *
 * Every waveform here has a known ground truth, which is what makes the diagnosis
 * engine falsifiable: feed it an outer-race fault and it must return outer-race.
 * The fault models follow the standard vibration literature —
 *
 *  - Bearing spall: a train of impacts, each exciting a damped structural resonance
 *    (McFadden–Smith / Antoni impulse-response model). Inner-race and ball defects
 *    are amplitude-modulated as the defect rotates through the load zone, which is
 *    what puts the 1x (BPFI) and cage (BSF) sidebands into a real spectrum.
 *  - Unbalance: a clean 1x radial line, phase-stable.
 *  - Misalignment: strong 2x with harmonics.
 *  - Cavitation: band-limited random noise (no discrete line), 500 Hz–5 kHz.
 *  - Oil whirl: a subsynchronous line at ~0.44x.
 *
 * A small random slip on the impact spacing and Gaussian background noise keep the
 * spectra from being unrealistically perfect. Everything is driven by a seeded PRNG
 * so a case is exactly reproducible.
 */

import { defectFrequencies, findBearing, type BearingSpec, type BearingGeometry } from "../bearings";

export type FaultType =
  | "healthy"
  | "unbalance"
  | "misalignment"
  | "looseness"
  | "bearing_outer"
  | "bearing_inner"
  | "bearing_ball"
  | "cavitation"
  | "oil_whirl";

export const FAULT_LABELS: Record<FaultType, string> = {
  healthy: "Saudavel",
  unbalance: "Desbalanceamento",
  misalignment: "Desalinhamento",
  looseness: "Folga mecanica",
  bearing_outer: "Rolamento — pista externa (BPFO)",
  bearing_inner: "Rolamento — pista interna (BPFI)",
  bearing_ball: "Rolamento — esfera (BSF)",
  cavitation: "Cavitacao",
  oil_whirl: "Whirl de oleo",
};

export interface GeneratorConfig {
  fault: FaultType;
  rpm: number;
  sampleRate: number;
  duration: number; // seconds
  severity?: number; // 0..1, defaults 0.6
  noise?: number; // background noise amplitude, defaults 0.05
  bearingDesignation?: string;
  bearingGeometry?: BearingGeometry;
  resonance?: number; // structural resonance for bearing impacts, Hz
  slip?: number; // bearing slip fraction
  seed?: number;
  /** Optional linear run-up: end RPM differs from start RPM over the record. */
  rpmEnd?: number;
}

export interface GeneratedSignal {
  samples: Float64Array;
  sampleRate: number;
  rpm: number;
  fault: FaultType;
  /** Ground-truth metadata, echoed for validation and display. */
  meta: {
    fault: FaultType;
    rpm: number;
    rpmEnd?: number;
    bearing?: string;
    resonance?: number;
    defectHz?: number;
  };
}

/** mulberry32 — small, fast, seedable PRNG. Deterministic given a seed. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box–Muller, drawing from a uniform RNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateSignal(config: GeneratorConfig): GeneratedSignal {
  const {
    fault,
    rpm,
    sampleRate: fs,
    duration,
    severity = 0.6,
    noise = 0.05,
    resonance = 3200,
    slip = 0.01,
    seed = 1,
    rpmEnd,
  } = config;

  const n = Math.floor(fs * duration);
  const x = new Float64Array(n);
  const rng = makeRng(seed);
  const fr0 = rpm / 60;
  const fr1 = (rpmEnd ?? rpm) / 60;

  // Instantaneous shaft rate and integrated phase, so run-ups stay phase-coherent.
  const shaftPhase = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const fr = fr0 + ((fr1 - fr0) * i) / n;
    phase += (2 * Math.PI * fr) / fs;
    shaftPhase[i] = phase;
  }

  // Resolve a bearing: custom geometry first, then catalogue lookup, always with a
  // safe fallback so an unknown designation (e.g. "custom" with no geometry) can
  // never leave `bearing` undefined and crash the impact model.
  const bearing: BearingSpec =
    (config.bearingGeometry
      ? { designation: "Personalizado", manufacturer: "—", description: "Geometria personalizada", geometry: config.bearingGeometry }
      : findBearing(config.bearingDesignation ?? "6205-2RS JEM SKF")) ?? findBearing("6205-2RS JEM SKF")!;

  let defectHz: number | undefined;

  // Baseline every machine has: a small 1x line plus a couple of harmonics.
  for (let i = 0; i < n; i++) {
    x[i] += 0.15 * Math.sin(shaftPhase[i]);
    x[i] += 0.04 * Math.sin(2 * shaftPhase[i] + 0.6);
    x[i] += 0.02 * Math.sin(3 * shaftPhase[i] + 1.1);
  }

  switch (fault) {
    case "healthy":
      break;

    case "unbalance": {
      // Pure 1x, phase-stable. Amplitude spans ISO zone B–D (a diagnosable fault).
      const amp = 1.5 + 5.5 * severity;
      for (let i = 0; i < n; i++) x[i] += amp * Math.sin(shaftPhase[i]);
      break;
    }

    case "misalignment": {
      // 2x dominant with a full harmonic series; 1x present but smaller.
      const a1 = 0.8 + 1.4 * severity;
      const a2 = 1.6 + 5.0 * severity;
      const a3 = 0.5 + 2.0 * severity;
      const a4 = 0.25 + 1.0 * severity;
      for (let i = 0; i < n; i++) {
        x[i] += a1 * Math.sin(shaftPhase[i] + 0.3);
        x[i] += a2 * Math.sin(2 * shaftPhase[i] + Math.PI); // ~180 deg
        x[i] += a3 * Math.sin(3 * shaftPhase[i] + 0.9);
        x[i] += a4 * Math.sin(4 * shaftPhase[i]);
      }
      break;
    }

    case "looseness": {
      // Many harmonics of 1x plus half-order subharmonics — the signature of a
      // loose foot / rattling joint that clips the waveform.
      const amp = 2.0 + 4.0 * severity;
      for (let i = 0; i < n; i++) {
        for (let h = 1; h <= 8; h++) x[i] += (amp / h) * Math.sin(h * shaftPhase[i] + 0.2 * h);
        x[i] += 0.8 * severity * Math.sin(0.5 * shaftPhase[i]);
      }
      break;
    }

    case "bearing_outer":
    case "bearing_inner":
    case "bearing_ball": {
      const freqs = defectFrequencies(bearing, rpm, slip);
      const map = { bearing_outer: freqs.bpfo, bearing_inner: freqs.bpfi, bearing_ball: freqs.bsf };
      defectHz = map[fault];
      addBearingImpacts(x, rng, { fs, defectHz, resonance, severity, fault, shaftRate: freqs.shaftRate, ftf: freqs.ftf });
      // A small unbalance line usually rides along with a real bearing fault.
      for (let i = 0; i < n; i++) x[i] += 0.25 * Math.sin(shaftPhase[i]);
      break;
    }

    case "cavitation": {
      // Broadband random energy, band-limited to 500 Hz–5 kHz via a 2nd-order
      // band-pass state applied to white noise. No discrete line.
      const amp = 0.5 + 2.5 * severity;
      addBandlimitedNoise(x, fs, 500, 5000, amp, rng);
      break;
    }

    case "oil_whirl": {
      // Subsynchronous instability at ~0.44x, plus its own second harmonic.
      const w = 0.44;
      const amp = 0.5 + 2.0 * severity;
      let wp = 0;
      for (let i = 0; i < n; i++) {
        const fr = fr0 + ((fr1 - fr0) * i) / n;
        wp += (2 * Math.PI * w * fr) / fs;
        x[i] += amp * Math.sin(wp) + 0.3 * amp * Math.sin(2 * wp);
      }
      defectHz = w * fr0;
      break;
    }
  }

  // Background Gaussian noise floor.
  for (let i = 0; i < n; i++) x[i] += noise * gaussian(rng);

  return {
    samples: x,
    sampleRate: fs,
    rpm,
    fault,
    meta: {
      fault,
      rpm,
      rpmEnd,
      bearing: bearing?.designation,
      resonance: fault.startsWith("bearing") ? resonance : undefined,
      defectHz,
    },
  };
}

/**
 * Impact train exciting a damped resonance. Inner-race and ball faults are
 * amplitude-modulated (by 1x and by the cage rate, respectively) because the defect
 * orbits through the load zone — this is what generates the diagnostic sidebands.
 */
interface ImpactParams {
  fs: number;
  defectHz: number;
  resonance: number;
  severity: number;
  fault: FaultType;
  shaftRate: number;
  ftf: number;
}

function addBearingImpacts(x: Float64Array, rng: () => number, params: ImpactParams): void {
  const { fs, defectHz, resonance, severity, fault, shaftRate, ftf } = params;
  const n = x.length;
  const period = fs / defectHz; // samples between impacts
  const zeta = 0.05; // structural damping
  const decay = zeta * 2 * Math.PI * resonance;
  const ringLen = Math.min(n, Math.floor((5 / decay) * fs));
  const baseAmp = 0.3 + 1.8 * severity;

  // Pre-compute one damped-sine impulse response.
  const ring = new Float64Array(ringLen);
  for (let j = 0; j < ringLen; j++) {
    const t = j / fs;
    ring[j] = Math.exp(-decay * t) * Math.sin(2 * Math.PI * resonance * t);
  }

  let impactTime = period * (0.5 + rng());
  while (impactTime < n) {
    const k = Math.round(impactTime);
    let mod = 1;
    if (fault === "bearing_inner") mod = 1 + 0.9 * Math.sin((2 * Math.PI * shaftRate * k) / fs);
    else if (fault === "bearing_ball") mod = 1 + 0.7 * Math.sin((2 * Math.PI * ftf * k) / fs);
    const amp = baseAmp * mod * (0.85 + 0.3 * rng()); // impact-to-impact variability
    for (let j = 0; j < ringLen && k + j < n; j++) x[k + j] += amp * ring[j];
    // Next impact with small random slip on the spacing.
    impactTime += period * (1 + 0.02 * (rng() - 0.5));
  }
}

/** White noise shaped by a resonant band-pass (Direct Form II biquad). */
function addBandlimitedNoise(
  x: Float64Array,
  fs: number,
  fLow: number,
  fHigh: number,
  amp: number,
  rng: () => number,
): void {
  const n = x.length;
  const fc = Math.sqrt(fLow * fHigh);
  const bw = fHigh - fLow;
  const q = fc / bw;
  const w0 = (2 * Math.PI * fc) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  // RBJ band-pass (constant skirt gain), normalised by a0. b1 = 0.
  const B0 = alpha / a0;
  const B2 = -alpha / a0;
  const A1 = (-2 * Math.cos(w0)) / a0;
  const A2 = (1 - alpha) / a0;
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < n; i++) {
    const input = gaussian(rng);
    const out = B0 * input + z1;
    z1 = z2 - A1 * out; // b1=0
    z2 = B2 * input - A2 * out;
    x[i] += amp * out;
  }
}
