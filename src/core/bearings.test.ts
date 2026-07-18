import { describe, it, expect } from "vitest";
import { ordersFromGeometry, defectFrequencies, findBearing, defectOrders } from "./bearings";

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
});
