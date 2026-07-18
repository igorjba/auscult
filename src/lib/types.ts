import type { SignalUnit, AnalysisInput } from "@/core/analyze";
import type { FaultType } from "@/core/signal/generator";
import type { BearingGeometry } from "@/core/bearings";

/** A loaded signal plus everything needed to analyse and label it. */
export interface AnalysisRequest {
  samples: Float64Array;
  sampleRate: number;
  rpm: number;
  unit: SignalUnit;
  accelInG?: boolean;
  bearingDesignation: string;
  bearingGeometry?: BearingGeometry;
  windowType: NonNullable<AnalysisInput["windowType"]>;
  machineGroup: NonNullable<AnalysisInput["machineGroup"]>;
  foundation: NonNullable<AnalysisInput["foundation"]>;
  waterfall: boolean;
  /** Human label for the source (e.g. "CWRU 130 · pista externa"). */
  label: string;
  /** Ground truth when known (synthetic or CWRU), for display only. */
  truth?: FaultType;
}
