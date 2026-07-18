/**
 * Case Western Reserve University bearing dataset — ground-truth catalogue for the
 * validation cases bundled with the app. These four 12 kHz drive-end records (6205
 * bearing, ~1797 rpm) carry a known fault, so the envelope detector can be scored
 * against reality rather than only against synthetic signals.
 *
 * Source: Case Western Reserve University Bearing Data Center.
 */

import type { FaultType } from "../signal/generator";

export interface CwruCase {
  id: string;
  file: string;
  truth: FaultType;
  label: string;
  faultSize: string;
  rpm: number;
  sampleRate: number;
  bearing: string;
}

export const CWRU_CASES: CwruCase[] = [
  {
    id: "97",
    file: "/data/cwru/97.mat",
    truth: "healthy",
    label: "Baseline normal",
    faultSize: "—",
    rpm: 1797,
    sampleRate: 12000,
    bearing: "6205-2RS JEM SKF",
  },
  {
    id: "105",
    file: "/data/cwru/105.mat",
    truth: "bearing_inner",
    label: "Pista interna",
    faultSize: "0,007 pol",
    rpm: 1797,
    sampleRate: 12000,
    bearing: "6205-2RS JEM SKF",
  },
  {
    id: "118",
    file: "/data/cwru/118.mat",
    truth: "bearing_ball",
    label: "Esfera",
    faultSize: "0,007 pol",
    rpm: 1797,
    sampleRate: 12000,
    bearing: "6205-2RS JEM SKF",
  },
  {
    id: "130",
    file: "/data/cwru/130.mat",
    truth: "bearing_outer",
    label: "Pista externa (6 h)",
    faultSize: "0,007 pol",
    rpm: 1797,
    sampleRate: 12000,
    bearing: "6205-2RS JEM SKF",
  },
];
