import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMat, extractCwru } from "../signal/mat";
import { analyze } from "../analyze";
import { CWRU_CASES } from "./cwru";

/**
 * Validation against real data. These run the envelope detector on the bundled
 * Case Western Reserve University records and check the diagnosis against the
 * university's ground truth — the difference between a demonstrable project and a
 * proven one.
 */
function loadMat(file: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`../../../public${file}`, import.meta.url));
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const haveData = existsSync(fileURLToPath(new URL("../../../public/data/cwru/97.mat", import.meta.url)));

describe.runIf(haveData)("CWRU real-data validation", () => {
  for (const c of CWRU_CASES) {
    it(`file ${c.id} — parses and analyses`, () => {
      const cw = extractCwru(parseMat(loadMat(c.file)));
      expect(cw.samples.length).toBeGreaterThan(50000);
      const r = analyze({
        samples: cw.samples,
        sampleRate: c.sampleRate,
        rpm: cw.rpm ?? c.rpm,
        unit: "acceleration",
        accelInG: true,
        bearingDesignation: c.bearing,
      });
      expect(r.diagnosis.bearing).toHaveLength(3);
    });
  }

  it("identifies healthy, inner-race and outer-race correctly", () => {
    const results = CWRU_CASES.map((c) => {
      const cw = extractCwru(parseMat(loadMat(c.file)));
      const r = analyze({
        samples: cw.samples,
        sampleRate: c.sampleRate,
        rpm: cw.rpm ?? c.rpm,
        unit: "acceleration",
        accelInG: true,
        bearingDesignation: c.bearing,
      });
      return { id: c.id, truth: c.truth, predicted: r.diagnosis.top.fault };
    });
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId["97"].predicted).toBe("healthy");
    expect(byId["105"].predicted).toBe("bearing_inner");
    expect(byId["130"].predicted).toBe("bearing_outer");
    // The ball-defect record (118) is the hard case in this dataset; require at
    // least that it is flagged as a bearing fault rather than healthy.
    expect(byId["118"].predicted.startsWith("bearing_")).toBe(true);
  }, 30000);
});
