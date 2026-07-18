/**
 * Explainable rule engine.
 *
 * Not a classifier black box: each hypothesis is scored by a small set of physical
 * conditions, and every condition that fired is returned as evidence. Two kinds of
 * quantity drive the scores:
 *
 *  - Absolute level (mm/s at 1x, broadband velocity RMS). A machine always has a 1x
 *    line; unbalance is only a fault when that line is *large*, so unbalance is
 *    anchored to physical amplitude, not to a ratio above the noise floor. This is
 *    also what separates a healthy machine from a faulty one.
 *  - Spectral shape (2x/1x, harmonic richness, envelope line dominance, broadband
 *    flatness, subsynchronous order). Shape names the fault type once level says a
 *    fault exists.
 *
 * The field knowledge, stated plainly:
 *   - large, dominant 1x, phase-stable, few harmonics ... unbalance
 *   - 2x comparable-to/above 1x, harmonic series ........ misalignment
 *   - long 1x harmonic series + half-order ............... mechanical looseness
 *   - impulsive ring; dominant envelope line at BPFO ..... outer-race fault
 *   - dominant BPFI + 1x sidebands / BSF + cage sidebands  inner-race / ball fault
 *   - broadband, flat, 500 Hz–5 kHz, no lines ............ cavitation
 *   - subsynchronous line at 0.42–0.48x .................. oil whirl
 *   - low level, no signature ............................ healthy
 */

import type { FaultType } from "../signal/generator";
import type { Spectrum } from "../dsp";
import type { DefectFrequencies } from "../bearings";
import {
  harmonicProfile,
  amplitudeNear,
  broadbandRatio,
  spectralFlatness,
  bearingEvidence,
  type BearingEvidence,
} from "./features";

export interface Evidence {
  text: string;
  supports: boolean;
  weight: number;
}

export interface Hypothesis {
  fault: FaultType;
  score: number; // 0..1
  evidence: Evidence[];
}

export interface DiagnosisInput {
  velocitySpectrum: Spectrum;
  envelopeSpectrum: Spectrum;
  shaftRate: number;
  defects: DefectFrequencies;
  /** Broadband velocity RMS (mm/s), 10–1000 Hz — the absolute level reference. */
  velocityRms: number;
  /** Std-dev of the 1x phase residual (radians). Low = stable. */
  phaseStability?: number;
  /** Kurtosis of the resonance band. Gates bearing hypotheses: <~4 means no impacts. */
  impulsiveness?: number;
}

export interface DiagnosisResult {
  ranked: Hypothesis[];
  top: Hypothesis;
  bearing: BearingEvidence[];
  summary: string;
}

/** Clamp-and-scale a value from [lo, hi] into [0, 1]. */
function sat(x: number, lo: number, hi: number): number {
  if (hi === lo) return x >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
}

export function diagnose(input: DiagnosisInput): DiagnosisResult {
  const { velocitySpectrum: vs, envelopeSpectrum, shaftRate, defects, velocityRms, phaseStability } = input;
  const prof = harmonicProfile(vs, shaftRate);
  const tol = Math.max(vs.freqResolution * 2, shaftRate * 0.04);

  // Absolute amplitudes (signal units, e.g. mm/s) at the first orders.
  const amp1x = amplitudeNear(vs, shaftRate, tol).amp;
  const amp2x = amplitudeNear(vs, 2 * shaftRate, tol).amp;
  const denom1x = Math.max(amp1x, prof.floor);
  const ratio2 = amp2x / denom1x;
  const ratio3 = prof.harmonics[2] / denom1x;
  const subRatio = prof.subsync.amp / denom1x;

  let harmCount = 0;
  for (let k = 1; k < prof.harmonics.length; k++) if (prof.harmonics[k] > prof.floor * 4) harmCount++;

  const bearing = bearingEvidence(envelopeSpectrum, defects);
  const bpfo = bearing.find((b) => b.name === "BPFO")!;
  const bpfi = bearing.find((b) => b.name === "BPFI")!;
  const bsf = bearing.find((b) => b.name === "BSF")!;

  const broadband = broadbandRatio(vs, 500, 5000);
  const flatness = spectralFlatness(vs, 500, 5000);

  const hyp: Hypothesis[] = [];

  // --- Unbalance: large, dominant 1x with a clean harmonic tail --------------
  {
    const level = sat(amp1x, 0.6, 4.0);
    const dominant = amp1x >= amp2x ? 1 : sat(amp1x / Math.max(amp2x, 1e-9), 0.6, 1.2);
    const clean = 1 - sat(ratio2, 0.35, 0.9);
    // A long 1x harmonic series is the signature of looseness, not a pure unbalance;
    // suppress unbalance as the series develops so the two don't collide.
    const pure = 1 - 0.9 * sat(harmCount, 3, 6);
    let score = level * (0.55 + 0.25 * dominant + 0.2 * clean) * pure;
    const ev: Evidence[] = [
      { text: `1x = ${amp1x.toFixed(2)} mm/s, dominante no espectro`, supports: level > 0.2 && amp1x >= amp2x, weight: 0.55 },
      { text: `2x/1x = ${ratio2.toFixed(2)} (baixo indica desbalanceamento puro)`, supports: ratio2 < 0.5, weight: 0.25 },
      { text: `${harmCount} harmonicas de 1x (poucas confirmam desbalanceamento)`, supports: harmCount < 3, weight: 0.2 },
    ];
    if (phaseStability !== undefined) {
      const stable = 1 - sat(phaseStability, 0.1, 0.8);
      score *= 0.85 + 0.15 * stable;
      ev.push({ text: `fase de 1x estavel (sigma = ${phaseStability.toFixed(2)} rad)`, supports: phaseStability < 0.4, weight: 0.15 });
    }
    hyp.push({ fault: "unbalance", score, evidence: ev });
  }

  // --- Misalignment: strong 2x with harmonics --------------------------------
  {
    const level = sat(Math.max(amp1x, amp2x), 0.5, 4.0);
    const shape = sat(ratio2, 0.5, 1.5);
    let score = level * (0.6 * shape + 0.25 * sat(ratio3, 0.2, 0.8));
    score += level * 0.15 * sat((prof.harmonics[3] + prof.harmonics[4]) / denom1x, 0.15, 0.7);
    hyp.push({
      fault: "misalignment",
      score,
      evidence: [
        { text: `2x forte relativo a 1x (2x/1x = ${ratio2.toFixed(2)})`, supports: ratio2 > 0.6, weight: 0.6 },
        { text: `3x presente (3x/1x = ${ratio3.toFixed(2)})`, supports: ratio3 > 0.25, weight: 0.25 },
        { text: "serie harmonica de 1x desenvolvida", supports: harmCount >= 3, weight: 0.15 },
      ],
    });
  }

  // --- Mechanical looseness: long harmonic series + half-order ---------------
  {
    const level = sat(Math.max(amp1x, prof.floor * 5), 0.5, 4.0);
    const rich = sat(harmCount, 4, 7);
    const inHalf = prof.subsync.order > 0.4 && prof.subsync.order < 0.6;
    const half = inHalf ? sat(subRatio, 0.1, 0.5) : 0;
    const score = level * (0.7 * rich + 0.3 * half);
    hyp.push({
      fault: "looseness",
      score,
      evidence: [
        { text: `${harmCount} harmonicas de 1x acima do ruido (folga gera serie longa)`, supports: harmCount >= 5, weight: 0.7 },
        { text: `subharmonica ~0.5x (ordem ${prof.subsync.order.toFixed(2)})`, supports: half > 0.1, weight: 0.3 },
      ],
    });
  }

  // --- Bearing faults: impulsive ring + dominant defect line -----------------
  hyp.push(...bearingHypotheses(bpfo, bpfi, bsf, input.impulsiveness));

  // --- Cavitation: broadband, flat, no discrete line -------------------------
  {
    // Broadband energy is mandatory (multiplicative): flatness alone is high for any
    // noise band, so misalignment/looseness must not leak into cavitation.
    const energy = sat(broadband, 0.3, 0.7);
    // A bearing spall dumps impulsive energy across the same band; suppress cavitation
    // when a discrete envelope line dominates, since cavitation has no such line.
    const maxDefectProm = Math.max(bpfo.prominence, bpfi.prominence, bsf.prominence);
    const noLine = 1 - sat(maxDefectProm, 400, 1500);
    const score = energy * (0.55 + 0.45 * sat(flatness, 0.35, 0.75)) * noLine;
    hyp.push({
      fault: "cavitation",
      score,
      evidence: [
        { text: `${(broadband * 100).toFixed(0)}% da energia em 500 Hz–5 kHz (banda larga)`, supports: broadband > 0.3, weight: 0.5 },
        { text: `espectro plano nessa banda (flatness = ${flatness.toFixed(2)})`, supports: flatness > 0.4, weight: 0.4 },
        { text: "ausencia de linha discreta dominante", supports: true, weight: 0.1 },
      ],
    });
  }

  // --- Oil whirl: subsynchronous line at 0.42–0.48x --------------------------
  {
    const inBand = prof.subsync.order >= 0.38 && prof.subsync.order <= 0.5;
    // Oil whirl is a journal-bearing instability — physically exclusive with a
    // rolling-element defect and always high-amplitude. Suppress it when a bearing
    // defect line dominates the envelope (it can't be both) and when the machine is
    // in ISO zone A (whirl is a severe condition, never a quiet one).
    const bandFactor = inBand ? 1 : 0.12;
    const notBearing = 1 - sat(Math.max(bpfo.prominence, bpfi.prominence, bsf.prominence), 400, 1500);
    // Anchor to absolute amplitude: whirl is a large subsynchronous line (mm/s), not
    // merely one that is large relative to a tiny 1x — the ratio alone explodes on a
    // quiet healthy machine where every component is small.
    const level = sat(prof.subsync.amp, 0.4, 2.0);
    const score = level * sat(subRatio, 0.3, 1.0) * bandFactor * notBearing;
    hyp.push({
      fault: "oil_whirl",
      score,
      evidence: [
        {
          text: `linha subsincrona em ${prof.subsync.order.toFixed(2)}x (whirl ocorre em 0.42–0.48x)`,
          supports: inBand && subRatio > 0.3,
          weight: 1,
        },
      ],
    });
  }

  // --- Healthy: low level, no dominant signature -----------------------------
  {
    const maxFault = Math.max(...hyp.map((x) => x.score));
    const lowLevel = 1 - sat(velocityRms, 0.5, 2.0);
    const score = Math.max(0, 1 - maxFault) * (0.4 + 0.6 * lowLevel);
    hyp.push({
      fault: "healthy",
      score,
      evidence: [
        { text: `nivel de vibracao ${velocityRms.toFixed(2)} mm/s`, supports: velocityRms < 1, weight: 0.5 },
        { text: "nenhuma assinatura de falha dominante", supports: maxFault < 0.4, weight: 0.5 },
      ],
    });
  }

  hyp.sort((a, b) => b.score - a.score);
  return { ranked: hyp, top: hyp[0], bearing, summary: buildSummary(hyp[0], hyp[1]) };
}

/**
 * Score the three bearing faults competitively. A real spall makes one defect line
 * dominate the envelope spectrum; the *share* of prominence among BPFO/BPFI/BSF
 * therefore names the fault, while sidebands (1x for inner-race, cage for ball)
 * confirm it. This resolves the failure mode where every fault, real or not,
 * scored maximum on outer-race just because a BPFO-adjacent bin was noisy.
 */
function bearingHypotheses(bpfo: BearingEvidence, bpfi: BearingEvidence, bsf: BearingEvidence, impulsiveness?: number): Hypothesis[] {
  const proms = [bpfo.prominence, bpfi.prominence, bsf.prominence];
  const total = proms.reduce((a, b) => a + b, 0) || 1;
  // Kurtosis reinforces but does not gate: on real, noisy data the defect line can
  // be unmistakable while the band kurtosis is only mildly elevated. Verified on the
  // CWRU set, whose inner/outer faults ring at kurtosis 3–9, not the 8+ clean
  // synthetics reach.
  const impFactor = impulsiveness === undefined ? 1 : 0.55 + 0.45 * sat(impulsiveness, 3, 7);

  const make = (fault: FaultType, b: BearingEvidence, share: number, name: string): Hypothesis => {
    // Prominence is the primary evidence: a real spall drives its envelope line far
    // above the continuum (CWRU faults: 1000–19000x floor; a healthy machine tops out
    // near 400x), while a stray noise peak sits near ~180x. Harmonic series and
    // sidebands refine but do not carry the call.
    const strong = sat(b.prominence, 300, 1200);
    const dominance = sat(share, 0.4, 0.72);
    const harmonic = sat(b.harmonics, 2, 4);
    const wantsSidebands = name !== "BPFO";
    const sidebandBonus = wantsSidebands ? sat(b.sidebandRatio, 0.15, 0.8) : 0;
    const score = impFactor * strong * dominance * (0.7 + 0.2 * harmonic + 0.1 * sidebandBonus);
    const ev: Evidence[] = [
      { text: `linha de ${name} dominante no envelope (${(share * 100).toFixed(0)}% da energia de defeito), ${b.prominence.toFixed(0)}x acima do ruido`, supports: dominance > 0.3 && strong > 0.2, weight: 0.5 },
      { text: `${b.harmonics} harmonica(s) de ${name} no envelope`, supports: b.harmonics >= 2, weight: 0.3 },
    ];
    if (wantsSidebands) {
      ev.push({ text: `bandas laterais (${name === "BPFI" ? "1x" : "gaiola"}) razao ${b.sidebandRatio.toFixed(2)}`, supports: b.sidebandRatio > 0.2, weight: 0.2 });
    }
    return { fault, score: Math.min(1, score), evidence: ev };
  };
  return [
    make("bearing_outer", bpfo, bpfo.prominence / total, "BPFO"),
    make("bearing_inner", bpfi, bpfi.prominence / total, "BPFI"),
    make("bearing_ball", bsf, bsf.prominence / total, "BSF"),
  ];
}

function buildSummary(top: Hypothesis, second: Hypothesis): string {
  const pct = Math.round(top.score * 100);
  const margin = top.score - second.score;
  const confidence = margin > 0.25 ? "alta" : margin > 0.1 ? "media" : "baixa";
  return `Diagnostico: ${top.fault} (score ${pct}%, confianca ${confidence}).`;
}
