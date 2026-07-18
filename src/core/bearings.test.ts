import { describe, it, expect } from "vitest";
import { ordersFromGeometry, defectFrequencies, findBearing, defectOrders, BEARING_CATALOG } from "./bearings";
import { generateSignal } from "./signal/generator";
import { analyze } from "./analyze";

describe("bearing kinematics", () => {
  it("derives the published CWRU factors for the 6205-2RS JEM SKF", () => {
    // Case Western Reserve University publishes these order factors for the
    // drive-end 6205 bearing; deriving them from geometry validates the formulas.
    const g = { rollingElements: 9, ballDiameter: 7.94, pitchDiameter: 39.04, contactAngle: 0 };
    const o = ordersFromGeometry(g);
    expect(o.bpfo).toBeCloseTo(3.5848, 3);
    expect(o.bpfi).toBeCloseTo(5.4152, 3);
    expect(o.ftf).toBeCloseTo(0.3983, 3);
    expect(o.bsf).toBeCloseTo(2.3568, 3);
  });

  it("BPFO + BPFI equals Nb times shaft rate (order sum identity)", () => {
    const spec = findBearing("6205-2RS JEM SKF")!;
    const o = defectOrders(spec);
    expect(o.bpfo + o.bpfi).toBeCloseTo(9, 6);
  });

  it("scales to Hz at 1797 RPM (CWRU baseline speed)", () => {
    const spec = findBearing("6205-2RS JEM SKF")!;
    const f = defectFrequencies(spec, 1797);
    expect(f.shaftRate).toBeCloseTo(29.95, 1);
    expect(f.bpfo).toBeCloseTo(107.36, 0);
    expect(f.bpfi).toBeCloseTo(162.19, 0);
  });

  it("applies slip below the kinematic value", () => {
    const spec = findBearing("6205-2RS JEM SKF")!;
    const nominal = defectFrequencies(spec, 1797, 0);
    const slipped = defectFrequencies(spec, 1797, 0.015);
    expect(slipped.bpfo).toBeLessThan(nominal.bpfo);
    expect(slipped.bpfo / nominal.bpfo).toBeCloseTo(0.985, 3);
  });

  it("derives self-consistent orders for every catalogue entry", () => {
    for (const b of BEARING_CATALOG) {
      const o = defectOrders(b);
      expect(o.bpfo).toBeGreaterThan(0);
      expect(o.bpfi).toBeGreaterThan(o.bpfo); // inner pass rate always exceeds outer
      expect(o.ftf).toBeLessThan(0.5); // cage always turns slower than half shaft rate
    }
  });
});

describe("custom bearing geometry", () => {
  it("generates and analyses a signal with a user-supplied geometry", () => {
    // Regression: a custom geometry must flow through generation and analysis
    // without falling back to a catalogue lookup that would return undefined.
    const geometry = { rollingElements: 10, ballDiameter: 12.7, pitchDiameter: 70, contactAngle: 0 };
    const sig = generateSignal({
      fault: "bearing_outer",
      rpm: 1800,
      sampleRate: 25600,
      duration: 1,
      severity: 0.7,
      bearingGeometry: geometry,
      seed: 5,
    });
    const r = analyze({ samples: sig.samples, sampleRate: 25600, rpm: 1800, unit: "velocity", bearingGeometry: geometry });
    expect(r.bearing.designation).toBe("Personalizado");
    expect(r.diagnosis.top.fault).toBe("bearing_outer");
  }, 15000);
});
