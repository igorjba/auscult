/**
 * Validation harness. Generates labelled synthetic cases across every fault class,
 * runs the full analysis pipeline, and scores the predicted fault against ground
 * truth. Because the generator's label is the truth, this yields an honest
 * confusion matrix — the diagnosis engine is either right or it isn't.
 */

import { generateSignal, type FaultType, type GeneratorConfig } from "../signal/generator";
import { analyze } from "../analyze";

export const VALIDATION_FAULTS: FaultType[] = [
  "healthy",
  "unbalance",
  "misalignment",
  "looseness",
  "bearing_outer",
  "bearing_inner",
  "bearing_ball",
  "cavitation",
  "oil_whirl",
];

export interface Case {
  fault: FaultType;
  config: GeneratorConfig;
}

/** A spread of speeds, severities, noise levels and seeds per fault class. */
export function buildTestSet(perClass = 6): Case[] {
  const cases: Case[] = [];
  const rpms = [1200, 1497, 1797, 2400, 2950, 3560];
  const severities = [0.45, 0.6, 0.75, 0.9, 0.55, 0.7];
  const noises = [0.03, 0.06, 0.05, 0.08, 0.04, 0.07];
  for (const fault of VALIDATION_FAULTS) {
    for (let i = 0; i < perClass; i++) {
      cases.push({
        fault,
        config: {
          fault,
          rpm: rpms[i % rpms.length],
          sampleRate: 25600,
          duration: 1,
          severity: severities[i % severities.length],
          noise: noises[i % noises.length],
          resonance: 3000 + 400 * (i % 3),
          seed: 1000 * (i + 1) + fault.length,
        },
      });
    }
  }
  return cases;
}

export interface Prediction {
  truth: FaultType;
  predicted: FaultType;
  score: number;
  correct: boolean;
}

export function runCase(c: Case): Prediction {
  const sig = generateSignal(c.config);
  const result = analyze({
    samples: sig.samples,
    sampleRate: sig.sampleRate,
    rpm: sig.rpm,
    unit: "velocity",
    bearingDesignation: c.config.bearingDesignation,
  });
  const predicted = result.diagnosis.top.fault;
  return { truth: c.fault, predicted, score: result.diagnosis.top.score, correct: predicted === c.fault };
}

export interface ConfusionMatrix {
  labels: FaultType[];
  matrix: number[][]; // matrix[truth][predicted]
  accuracy: number;
  perClass: Record<FaultType, { precision: number; recall: number; support: number }>;
}

export function confusionMatrix(predictions: Prediction[]): ConfusionMatrix {
  const labels = VALIDATION_FAULTS;
  const idx = new Map(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => labels.map(() => 0));
  for (const p of predictions) matrix[idx.get(p.truth)!][idx.get(p.predicted)!]++;

  let correct = 0;
  const perClass = {} as ConfusionMatrix["perClass"];
  for (let t = 0; t < labels.length; t++) {
    const support = matrix[t].reduce((a, b) => a + b, 0);
    const truePos = matrix[t][t];
    correct += truePos;
    let predictedTotal = 0;
    for (let r = 0; r < labels.length; r++) predictedTotal += matrix[r][t];
    perClass[labels[t]] = {
      recall: support > 0 ? truePos / support : 0,
      precision: predictedTotal > 0 ? truePos / predictedTotal : 0,
      support,
    };
  }
  return { labels, matrix, accuracy: correct / predictions.length, perClass };
}

export function runValidation(perClass = 6): { predictions: Prediction[]; confusion: ConfusionMatrix } {
  const predictions = buildTestSet(perClass).map(runCase);
  return { predictions, confusion: confusionMatrix(predictions) };
}
