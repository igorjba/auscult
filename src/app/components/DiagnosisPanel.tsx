"use client";

import type { DiagnosisResult } from "@/core/diagnosis/rules";
import { FAULT_LABELS } from "@/core/signal/generator";
import s from "./panels.module.css";

const FAULT_COLOR: Record<string, string> = {
  healthy: "var(--zone-a)",
  unbalance: "var(--amber)",
  misalignment: "var(--amber)",
  looseness: "var(--amber)",
  bearing_outer: "var(--zone-d)",
  bearing_inner: "var(--zone-d)",
  bearing_ball: "var(--zone-d)",
  cavitation: "var(--violet)",
  oil_whirl: "var(--violet)",
};

export function DiagnosisPanel({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const top = diagnosis.top;
  const second = diagnosis.ranked[1];
  const margin = top.score - (second?.score ?? 0);
  const confidence = margin > 0.25 ? "confianca alta" : margin > 0.1 ? "confianca media" : "confianca baixa";
  const color = FAULT_COLOR[top.fault] ?? "var(--accent)";

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className="eyebrow">Diagnostico</span>
        <span className={s.confidence}>{confidence}</span>
      </div>

      <div className={s.verdict} style={{ borderLeft: `3px solid ${color}` }}>
        <span className={s.verdictName} style={{ color }}>
          {FAULT_LABELS[top.fault]}
        </span>
        <span className={s.verdictScore} style={{ color }}>
          {Math.round(top.score * 100)}%
        </span>
      </div>

      <div className={s.ranked}>
        {diagnosis.ranked.slice(0, 5).map((h) => (
          <div key={h.fault} className={s.rankRow}>
            <span className={s.rankName}>{FAULT_LABELS[h.fault]}</span>
            <span className={s.rankBarTrack}>
              <span
                className={s.rankBarFill}
                style={{ width: `${Math.max(2, h.score * 100)}%`, background: FAULT_COLOR[h.fault] ?? "var(--accent)" }}
              />
            </span>
            <span className={s.rankPct}>{Math.round(h.score * 100)}</span>
          </div>
        ))}
      </div>

      <div className={s.evidence}>
        {top.evidence.map((e) => (
          <div key={e.text} className={s.evItem}>
            <span className={`${s.evMark} ${e.supports ? s.evYes : s.evNo}`}>{e.supports ? "✓" : "·"}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
