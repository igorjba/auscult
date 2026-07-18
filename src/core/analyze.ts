/**
 * End-to-end analysis pipeline. Takes a raw vibration record and produces
 * everything the UI and the validation suite need: display spectra, the envelope
 * spectrum, the ISO severity zone, and the ranked, explained diagnosis.
 *
 * Unit handling is explicit. Pattern rules (harmonics, bearing lines) run on the
 * signal as acquired — acceleration best reveals the high-frequency impacts a
 * bearing fault produces. The ISO severity check, by contrast, is defined on
 * velocity RMS, so an acceleration record is integrated to velocity first.
 */

import {
  amplitudeSpectrum,
  welchPSD,
  bandRMS,
  envelopeAnalysis,
  integrateToVelocity,
  bandpass,
  analyticSignal,
  instantaneousPhase,
  type Spectrum,
  type WindowType,
} from "./dsp";
import { findBearing, defectFrequencies, type BearingSpec, type BearingGeometry } from "./bearings";
import { diagnose, type DiagnosisResult } from "./diagnosis/rules";
import { classifySeverity, type SeverityAssessment, type MachineGroup, type Foundation } from "./diagnosis/severity";

export type SignalUnit = "velocity" | "acceleration" | "displacement";

export interface AnalysisInput {
  samples: Float64Array;
  sampleRate: number;
  rpm: number;
  unit: SignalUnit;
  /** g when unit is acceleration; ignored otherwise. */
  accelInG?: boolean;
  bearingDesignation?: string;
  /** Custom bearing geometry; overrides the catalogue lookup when present. */
  bearingGeometry?: BearingGeometry;
  resonanceBand?: [number, number];
  windowType?: WindowType;
  machineGroup?: MachineGroup;
  foundation?: Foundation;
}

export interface AnalysisResult {
  displaySpectrum: Spectrum;
  velocitySpectrum: Spectrum;
  envelopeSpectrum: Spectrum;
  envelope: Float64Array;
  resonanceBand: [number, number];
  velocityRms: number;
  severity: SeverityAssessment;
  diagnosis: DiagnosisResult;
  defects: ReturnType<typeof defectFrequencies>;
  bearing: BearingSpec;
  shaftRate: number;
}

const LARGEST_POW2 = (n: number) => (n < 2 ? 1 : 1 << Math.floor(Math.log2(n)));

export function analyze(input: AnalysisInput): AnalysisResult {
  const { samples, sampleRate: fs, rpm, unit } = input;
  const shaftRate = rpm / 60;
  const bearing: BearingSpec = input.bearingGeometry
    ? { designation: "Personalizado", manufacturer: "—", description: "Geometria personalizada", geometry: input.bearingGeometry }
    : findBearing(input.bearingDesignation ?? "6205-2RS JEM SKF") ?? findBearing("6205-2RS JEM SKF")!;
  const defects = defectFrequencies(bearing, rpm);

  // Velocity signal (mm/s) for the amplitude spectrum and ISO severity.
  let velocity: Float64Array;
  if (unit === "velocity") {
    velocity = Float64Array.from(samples);
  } else if (unit === "acceleration") {
    velocity = integrateToVelocity(samples, fs, {
      // 5 Hz high-pass: integration divides by omega, hugely amplifying near-DC
      // content, so a low corner would turn acquisition drift into a spurious
      // subsynchronous hump. ISO velocity is defined from 10 Hz anyway.
      highpassHz: 5,
      inputScale: input.accelInG ? 9.80665 : 1,
      outputScale: 1000, // m/s -> mm/s
    });
  } else {
    // Displacement -> velocity by differentiation is noisy; approximate via the
    // amplitude spectrum scaling instead. For displacement inputs we treat the raw
    // signal as the velocity proxy for pattern purposes.
    velocity = Float64Array.from(samples);
  }

  const nWin = Math.min(LARGEST_POW2(samples.length), 1 << 15);
  const displaySpectrum = amplitudeSpectrum(
    Float64Array.prototype.slice.call(unit === "acceleration" ? samples : velocity, 0, nWin),
    fs,
    input.windowType ?? "hann",
  );
  const velocitySpectrum = amplitudeSpectrum(
    Float64Array.prototype.slice.call(velocity, 0, nWin),
    fs,
    input.windowType ?? "hann",
  );

  // ISO severity from broadband velocity RMS, 10–1000 Hz.
  const psd = welchPSD(velocity, fs, { segmentLength: Math.min(4096, nWin), overlap: 0.5 });
  const velocityRms = bandRMS(psd, 10, Math.min(1000, fs / 2));
  const severity = classifySeverity(velocityRms, input.machineGroup, input.foundation);

  // Envelope analysis on the as-acquired signal (acceleration reveals impacts best).
  const env = envelopeAnalysis(samples, fs, { band: input.resonanceBand });

  const phaseStability = estimatePhaseStability(velocity, fs, shaftRate);

  const diagnosis = diagnose({
    velocitySpectrum,
    envelopeSpectrum: env.spectrum,
    shaftRate,
    defects,
    velocityRms,
    phaseStability,
    impulsiveness: env.impulsiveness,
  });

  return {
    displaySpectrum,
    velocitySpectrum,
    envelopeSpectrum: env.spectrum,
    envelope: env.envelope,
    resonanceBand: env.band,
    velocityRms,
    severity,
    diagnosis,
    defects,
    bearing,
    shaftRate,
  };
}

/**
 * Phase stability of the 1x component: band-pass around shaft rate, take the
 * Hilbert phase, and measure how much the phase *residual* (after removing the
 * expected linear ramp) drifts across the record. Unbalance holds a rock-steady
 * phase; a rub or looseness makes it wander.
 */
function estimatePhaseStability(velocity: Float64Array, fs: number, shaftRate: number): number {
  if (shaftRate <= 0) return 1;
  const filtered = bandpass(velocity, fs, Math.max(1, shaftRate * 0.6), shaftRate * 1.5);
  const phase = instantaneousPhase(analyticSignal(filtered));
  const n = phase.length;
  if (n < 4) return 1;
  const expectedSlope = (2 * Math.PI * shaftRate) / fs;
  // Residual = phase minus best-fit linear ramp; report its standard deviation.
  const residual = new Float64Array(n);
  for (let i = 0; i < n; i++) residual[i] = phase[i] - expectedSlope * i;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += residual[i];
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (residual[i] - mean) ** 2;
  return Math.sqrt(varSum / n) / Math.PI; // normalise to ~[0,1+]
}
