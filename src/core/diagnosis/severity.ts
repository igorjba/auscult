/**
 * Vibration severity zones per ISO 10816-3 / ISO 20816-3.
 *
 * The standard classifies broadband RMS velocity (10–1000 Hz, mm/s) into four
 * zones: A (newly commissioned), B (unrestricted long-term operation), C
 * (restricted — short-term only), D (damaging). Boundaries depend on machine size
 * group and whether the support is rigid or flexible. These are the tabulated
 * limits for the two most common groups.
 */

export type IsoZone = "A" | "B" | "C" | "D";

export type MachineGroup = "group1" | "group2";
export type Foundation = "rigid" | "flexible";

interface ZoneBoundaries {
  ab: number; // A/B boundary, mm/s RMS
  bc: number; // B/C boundary
  cd: number; // C/D boundary
}

const ISO_LIMITS: Record<MachineGroup, Record<Foundation, ZoneBoundaries>> = {
  // Group 1: large machines, 300 kW–50 MW; shaft height >= 315 mm.
  group1: {
    rigid: { ab: 2.3, bc: 4.5, cd: 7.1 },
    flexible: { ab: 3.5, bc: 7.1, cd: 11.0 },
  },
  // Group 2: medium machines, 15–300 kW; shaft height 160–315 mm.
  group2: {
    rigid: { ab: 1.4, bc: 2.8, cd: 4.5 },
    flexible: { ab: 2.3, bc: 4.5, cd: 7.1 },
  },
};

export interface SeverityAssessment {
  zone: IsoZone;
  velocityRms: number;
  boundaries: ZoneBoundaries;
  label: string;
  recommendation: string;
}

const ZONE_TEXT: Record<IsoZone, { label: string; recommendation: string }> = {
  A: { label: "Zona A — maquina nova", recommendation: "Vibracao tipica de maquina recem-comissionada." },
  B: { label: "Zona B — operacao aceitavel", recommendation: "Adequada para operacao continua sem restricao." },
  C: {
    label: "Zona C — insatisfatorio",
    recommendation: "Operacao restrita a curto prazo; planejar intervencao corretiva.",
  },
  D: { label: "Zona D — dano", recommendation: "Severidade suficiente para causar dano. Investigar e corrigir." },
};

export function classifySeverity(
  velocityRms: number,
  group: MachineGroup = "group2",
  foundation: Foundation = "rigid",
): SeverityAssessment {
  const b = ISO_LIMITS[group][foundation];
  let zone: IsoZone;
  if (velocityRms <= b.ab) zone = "A";
  else if (velocityRms <= b.bc) zone = "B";
  else if (velocityRms <= b.cd) zone = "C";
  else zone = "D";
  return { zone, velocityRms, boundaries: b, ...ZONE_TEXT[zone] };
}
