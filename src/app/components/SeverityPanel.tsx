"use client";

import type { SeverityAssessment } from "@/core/diagnosis/severity";
import s from "./panels.module.css";

const ZONE_COLORS = { A: "var(--zone-a)", B: "var(--zone-b)", C: "var(--zone-c)", D: "var(--zone-d)" } as const;

export function SeverityPanel({ severity }: { severity: SeverityAssessment }) {
  const { boundaries: b, zone } = severity;
  const ranges = {
    A: `< ${b.ab}`,
    B: `${b.ab}–${b.bc}`,
    C: `${b.bc}–${b.cd}`,
    D: `> ${b.cd}`,
  };

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className="eyebrow">Severidade ISO 20816</span>
        <span className={s.confidence}>mm/s RMS · 10–1000 Hz</span>
      </div>

      <div className={s.zones}>
        {(["A", "B", "C", "D"] as const).map((z) => {
          const active = z === zone;
          return (
            <div
              key={z}
              className={`${s.zone} ${active ? s.zoneActive : ""}`}
              style={active ? { color: ZONE_COLORS[z], borderColor: ZONE_COLORS[z] } : undefined}
            >
              <div className={s.zoneLetter} style={{ color: active ? ZONE_COLORS[z] : "var(--text-faint)" }}>
                {z}
              </div>
              <div className={s.zoneRange}>{ranges[z]}</div>
            </div>
          );
        })}
      </div>

      <div className={s.rmsRow}>
        <span className={s.rmsValue} style={{ color: ZONE_COLORS[zone] }}>
          {severity.velocityRms.toFixed(2)}
        </span>
        <span className={s.rmsUnit}>mm/s</span>
      </div>
      <div className={s.recommendation}>
        <strong style={{ color: ZONE_COLORS[zone] }}>{severity.label}.</strong> {severity.recommendation}
      </div>
    </div>
  );
}
