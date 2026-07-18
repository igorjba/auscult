/**
 * Rolling-element bearing geometry and characteristic defect frequencies.
 *
 * A localised spall strikes at a rate fixed by the bearing kinematics and the shaft
 * speed. From the number of rolling elements Nb, the ball diameter Bd, the pitch
 * diameter Pd and the contact angle phi, with shaft rate fr = RPM/60:
 *
 *   FTF  = (fr/2)·(1 − (Bd/Pd)·cos phi)                 cage / fundamental train
 *   BPFO = (Nb·fr/2)·(1 − (Bd/Pd)·cos phi)              outer-race ball pass
 *   BPFI = (Nb·fr/2)·(1 + (Bd/Pd)·cos phi)              inner-race ball pass
 *   BSF  = (Pd·fr/2Bd)·(1 − (Bd/Pd)²·cos² phi)          ball spin
 *
 * A ball defect contacts both races once per spin, so the *observed* ball-fault
 * line is usually 2·BSF, modulated by the cage rate FTF.
 *
 * These are kinematic ideals. Under load the contact angle wanders and the elements
 * slip, pulling the real lines 1–2% below theory — modelled here as `slip`.
 */

export interface BearingGeometry {
  rollingElements: number;
  ballDiameter: number; // mm
  pitchDiameter: number; // mm
  contactAngle: number; // radians
}

/** Defect frequencies as multiples of shaft rate (orders). */
export interface DefectOrders {
  ftf: number;
  bpfo: number;
  bpfi: number;
  bsf: number;
}

export interface BearingSpec {
  designation: string;
  manufacturer: string;
  description: string;
  geometry?: BearingGeometry;
  /** Published order factors, used when geometry is unavailable or overridden. */
  orderFactors?: DefectOrders;
}

export function ordersFromGeometry(g: BearingGeometry): DefectOrders {
  const ratio = (g.ballDiameter / g.pitchDiameter) * Math.cos(g.contactAngle);
  const n = g.rollingElements;
  const bsfRatio = g.ballDiameter / g.pitchDiameter;
  return {
    ftf: 0.5 * (1 - ratio),
    bpfo: (n / 2) * (1 - ratio),
    bpfi: (n / 2) * (1 + ratio),
    bsf: (g.pitchDiameter / (2 * g.ballDiameter)) * (1 - bsfRatio * bsfRatio * Math.cos(g.contactAngle) ** 2),
  };
}

export function defectOrders(spec: BearingSpec): DefectOrders {
  if (spec.geometry) return ordersFromGeometry(spec.geometry);
  if (spec.orderFactors) return spec.orderFactors;
  throw new Error(`Bearing ${spec.designation} has neither geometry nor order factors`);
}

export interface DefectFrequencies {
  ftf: number;
  bpfo: number;
  bpfi: number;
  /** 2·BSF — the line an actual ball defect produces. */
  bsf: number;
  shaftRate: number;
}

/**
 * Defect frequencies in Hz for a given speed. `slip` (0–0.02 typical) pulls the
 * race-pass lines below their kinematic value to match what a real spectrum shows.
 */
export function defectFrequencies(spec: BearingSpec, rpm: number, slip = 0): DefectFrequencies {
  const fr = rpm / 60;
  const o = defectOrders(spec);
  const s = 1 - slip;
  return {
    shaftRate: fr,
    ftf: o.ftf * fr * s,
    bpfo: o.bpfo * fr * s,
    bpfi: o.bpfi * fr * s,
    bsf: 2 * o.bsf * fr * s,
  };
}

/**
 * Catalogue. The two CWRU test bearings are stored by verified geometry (the unit
 * test checks the derived orders against the university's published factors); the
 * rest carry nominal geometry for the 62/63 deep-groove series. Any bearing not
 * listed can be entered by its four dimensions.
 */
export const BEARING_CATALOG: BearingSpec[] = [
  {
    designation: "6205-2RS JEM SKF",
    manufacturer: "SKF",
    description: "Rigido de esferas — mancal motriz do dataset CWRU (drive end)",
    geometry: { rollingElements: 9, ballDiameter: 7.94, pitchDiameter: 39.04, contactAngle: 0 },
  },
  {
    designation: "6203-2RS JEM SKF",
    manufacturer: "SKF",
    description: "Rigido de esferas — mancal ventilador do dataset CWRU (fan end)",
    orderFactors: { ftf: 0.3817, bpfo: 3.053, bpfi: 4.9469, bsf: 1.8874 },
  },
  {
    designation: "6004",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 20 mm, serie leve — geometria nominal",
    geometry: { rollingElements: 9, ballDiameter: 6.35, pitchDiameter: 31.0, contactAngle: 0 },
  },
  {
    designation: "6008",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 40 mm, serie leve — geometria nominal",
    geometry: { rollingElements: 13, ballDiameter: 7.94, pitchDiameter: 54.0, contactAngle: 0 },
  },
  {
    designation: "6204",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 20 mm — geometria nominal",
    geometry: { rollingElements: 8, ballDiameter: 7.94, pitchDiameter: 33.5, contactAngle: 0 },
  },
  {
    designation: "6206",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 30 mm — geometria nominal",
    geometry: { rollingElements: 9, ballDiameter: 9.53, pitchDiameter: 46.0, contactAngle: 0 },
  },
  {
    designation: "6207",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 35 mm — geometria nominal",
    geometry: { rollingElements: 9, ballDiameter: 11.11, pitchDiameter: 53.5, contactAngle: 0 },
  },
  {
    designation: "6208",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 40 mm — geometria nominal",
    geometry: { rollingElements: 9, ballDiameter: 11.91, pitchDiameter: 60.0, contactAngle: 0 },
  },
  {
    designation: "6210",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 50 mm — geometria nominal",
    geometry: { rollingElements: 10, ballDiameter: 12.7, pitchDiameter: 70.0, contactAngle: 0 },
  },
  {
    designation: "6305",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 25 mm, serie media — geometria nominal",
    geometry: { rollingElements: 7, ballDiameter: 11.51, pitchDiameter: 44.6, contactAngle: 0 },
  },
  {
    designation: "6307",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 35 mm, serie media — geometria nominal",
    geometry: { rollingElements: 8, ballDiameter: 15.08, pitchDiameter: 58.5, contactAngle: 0 },
  },
  {
    designation: "6309",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 45 mm, serie pesada — geometria nominal",
    geometry: { rollingElements: 8, ballDiameter: 17.46, pitchDiameter: 72.5, contactAngle: 0 },
  },
  {
    designation: "6311",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 55 mm, serie pesada — geometria nominal",
    geometry: { rollingElements: 8, ballDiameter: 20.64, pitchDiameter: 88.0, contactAngle: 0 },
  },
  {
    designation: "6316",
    manufacturer: "SKF",
    description: "Rigido de esferas, furo 80 mm, serie pesada — geometria nominal",
    geometry: { rollingElements: 8, ballDiameter: 30.16, pitchDiameter: 125.0, contactAngle: 0 },
  },
  {
    designation: "NU 208 ECP",
    manufacturer: "SKF",
    description: "Rolos cilindricos, furo 40 mm — geometria nominal",
    geometry: { rollingElements: 12, ballDiameter: 10.0, pitchDiameter: 60.0, contactAngle: 0 },
  },
  {
    designation: "NU 2208 ECP",
    manufacturer: "SKF",
    description: "Rolos cilindricos, furo 40 mm — geometria nominal",
    geometry: { rollingElements: 14, ballDiameter: 11.0, pitchDiameter: 63.0, contactAngle: 0 },
  },
  {
    designation: "22208 E",
    manufacturer: "SKF",
    description: "Rolos esfericos, furo 40 mm — geometria nominal",
    geometry: { rollingElements: 14, ballDiameter: 12.0, pitchDiameter: 65.0, contactAngle: 0.17 },
  },
];

export function findBearing(designation: string): BearingSpec | undefined {
  return BEARING_CATALOG.find((b) => b.designation === designation);
}
