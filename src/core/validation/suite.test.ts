import { describe, it, expect } from "vitest";
import { runValidation, buildTestSet, runCase, VALIDATION_FAULTS } from "./suite";
import { generateSignal } from "../signal/generator";
import { analyze } from "../analyze";

describe("diagnosis validation", () => {
  it("classifies the synthetic ground-truth set with high accuracy", () => {
    const { confusion } = runValidation(8);
    expect(confusion.accuracy).toBeGreaterThanOrEqual(0.9);
  }, 60000);

  it("every fault class is represented and mostly recovered", () => {
    const { confusion } = runValidation(4);
    for (const fault of VALIDATION_FAULTS) {
      expect(confusion.perClass[fault].support).toBeGreaterThan(0);
      expect(confusion.perClass[fault].recall).toBeGreaterThanOrEqual(0.5);
    }
  }, 60000);

  it("stays robust under elevated noise", () => {
    // Independent of the tuned test grid: fresh seeds, heavier noise floor.
    let correct = 0;
    let total = 0;
    for (const fault of VALIDATION_FAULTS) {
      for (let i = 0; i < 4; i++) {
        const sig = generateSignal({
          fault,
          rpm: 1500 + 300 * i,
          sampleRate: 25600,
          duration: 1,
          severity: 0.6,
          noise: 0.12,
          seed: 90000 + i * 7 + fault.length,
        });
        const r = analyze({ samples: sig.samples, sampleRate: 25600, rpm: sig.rpm, unit: "velocity" });
        if (r.diagnosis.top.fault === fault) correct++;
        total++;
      }
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.8);
  });

  it("produces evidence for the top hypothesis", () => {
    const c = buildTestSet(1).find((x) => x.fault === "bearing_outer")!;
    const p = runCase(c);
    expect(p.predicted).toBe("bearing_outer");
    const sig = generateSignal(c.config);
    const r = analyze({ samples: sig.samples, sampleRate: sig.sampleRate, rpm: sig.rpm, unit: "velocity" });
    expect(r.diagnosis.top.evidence.length).toBeGreaterThan(0);
    expect(r.diagnosis.bearing).toHaveLength(3);
  }, 30000);
});
