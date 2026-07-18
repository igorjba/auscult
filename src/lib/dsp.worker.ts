/// <reference lib="webworker" />
/**
 * DSP worker. The analysis pipeline runs several large FFTs (~120 ms for a one-second
 * record); doing that on the main thread would jank every interaction. The worker
 * takes a raw signal plus parameters and returns the full analysis and a waterfall,
 * keeping the UI thread free for rendering and input.
 */

import { analyze, type AnalysisInput, type AnalysisResult } from "@/core/analyze";
import { computeWaterfall, type Waterfall } from "@/core/dsp";
import type { BearingGeometry } from "@/core/bearings";

export interface ProcessRequest {
  id: number;
  samples: Float64Array;
  sampleRate: number;
  rpm: number;
  unit: AnalysisInput["unit"];
  accelInG?: boolean;
  bearingDesignation?: string;
  bearingGeometry?: BearingGeometry;
  windowType?: AnalysisInput["windowType"];
  resonanceBand?: [number, number];
  machineGroup?: AnalysisInput["machineGroup"];
  foundation?: AnalysisInput["foundation"];
  waterfall?: boolean;
}

export interface ProcessResponse {
  id: number;
  ok: boolean;
  analysis?: AnalysisResult;
  waterfall?: Waterfall;
  error?: string;
}

self.onmessage = (e: MessageEvent<ProcessRequest>) => {
  const req = e.data;
  try {
    const analysis = analyze({
      samples: req.samples,
      sampleRate: req.sampleRate,
      rpm: req.rpm,
      unit: req.unit,
      accelInG: req.accelInG,
      bearingDesignation: req.bearingDesignation,
      bearingGeometry: req.bearingGeometry,
      windowType: req.windowType,
      resonanceBand: req.resonanceBand,
      machineGroup: req.machineGroup,
      foundation: req.foundation,
    });

    let waterfall: Waterfall | undefined;
    if (req.waterfall) {
      const maxFreq = req.unit === "acceleration" ? req.sampleRate / 2 : Math.min(2000, req.sampleRate / 2);
      waterfall = computeWaterfall(req.samples, req.sampleRate, {
        frameSize: 2048,
        overlap: 0.75,
        maxFreq,
      });
    }

    const response: ProcessResponse = { id: req.id, ok: true, analysis, waterfall };
    self.postMessage(response);
  } catch (err) {
    const response: ProcessResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
