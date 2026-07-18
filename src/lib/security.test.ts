import { describe, it, expect } from "vitest";
import { importCase } from "./storage";
import { assertSampleCount, assertFileSize, MAX_SAMPLES, MAX_FILE_BYTES } from "./limits";
import { parseWav } from "@/core/signal/parsers";

/** Build a minimal WAV with a caller-controlled (possibly hostile) header. */
function makeWav(opts: { numChannels: number; bits: number; declaredDataBytes: number; actualDataBytes: number }): ArrayBuffer {
  const { numChannels, bits, declaredDataBytes, actualDataBytes } = opts;
  const buf = new ArrayBuffer(44 + actualDataBytes);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + actualDataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numChannels, true);
  v.setUint32(24, 44100, true);
  v.setUint32(28, 44100, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, bits, true);
  tag(36, "data");
  v.setUint32(40, declaredDataBytes, true);
  return buf;
}

describe("parseWav hardening", () => {
  it("rejects a zero channel count", () => {
    expect(() => parseWav(makeWav({ numChannels: 0, bits: 16, declaredDataBytes: 100, actualDataBytes: 100 }))).toThrow();
  });

  it("rejects an unsupported bit depth", () => {
    expect(() => parseWav(makeWav({ numChannels: 1, bits: 7, declaredDataBytes: 100, actualDataBytes: 100 }))).toThrow();
  });

  it("clamps a bloated declared data length to the real buffer (no OOB read)", () => {
    // Header lies: claims 1 GB of data while the file holds 200 bytes.
    const wav = makeWav({ numChannels: 1, bits: 16, declaredDataBytes: 1_000_000_000, actualDataBytes: 200 });
    const parsed = parseWav(wav);
    expect(parsed.samples.length).toBe(100); // 200 bytes / 2 bytes-per-sample
    expect(parsed.samples.every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe("importCase hardening", () => {
  const okSamples = Array.from({ length: 32 }, (_, i) => Math.sin(i));
  const base = { id: "c1", name: "x", samples: okSamples, sampleRate: 12000, rpm: 1797, unit: "acceleration", diagnosis: { fault: "healthy", score: 0.9, zone: "A", velocityRms: 0.1 } };

  it("rejects non-object and missing samples", () => {
    expect(() => importCase("42")).toThrow();
    expect(() => importCase(JSON.stringify({ id: "x" }))).toThrow();
  });

  it("rejects non-numeric samples", () => {
    const poisoned = [...okSamples];
    poisoned[5] = "boom" as unknown as number;
    expect(() => importCase(JSON.stringify({ ...base, samples: poisoned }))).toThrow();
  });

  it("caps sample count and file size (DoS guard)", () => {
    expect(() => assertSampleCount(MAX_SAMPLES + 1)).toThrow();
    expect(() => assertSampleCount(1000)).not.toThrow();
    expect(() => assertSampleCount(4)).toThrow(); // too short
    expect(() => assertFileSize(MAX_FILE_BYTES + 1)).toThrow();
    expect(() => assertFileSize(1_000_000)).not.toThrow();
  });

  it("recovers gracefully from invalid sampleRate/rpm", () => {
    const c = importCase(JSON.stringify({ ...base, sampleRate: -5, rpm: 0 }));
    expect(c.sampleRate).toBeGreaterThan(0);
    expect(c.rpm).toBeGreaterThan(0);
  });

  it("sanitises unknown unit and over-long strings", () => {
    const c = importCase(JSON.stringify({ ...base, unit: "javascript:alert(1)", name: "a".repeat(5000) }));
    expect(c.unit).toBe("acceleration");
    expect(c.name.length).toBeLessThanOrEqual(200);
    expect(c.samples).toHaveLength(32);
  });

  it("does not carry prototype-polluting keys through", () => {
    const samples = JSON.stringify(okSamples);
    const c = importCase(`{"id":"c","samples":${samples},"__proto__":{"polluted":true}}`);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(c.samples).toHaveLength(32);
  });
});
