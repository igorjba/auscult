"use client";

import type { DiagnosisResult } from "@/core/diagnosis/rules";
import { FAULT_LABELS } from "@/core/signal/generator";
import { InfoTip } from "./InfoTip";
import s from "./panels.module.css";

const FAULT_HELP: Record<string, string> = {
  healthy: "Nenhum defeito claro: a maquina vibra dentro do normal.",
  unbalance: "Desbalanceamento: massa mal distribuida no rotor. Costuma vibrar forte na frequencia de rotacao (1x).",
  misalignment: "Desalinhamento: eixos acoplados fora de linha. Marca forte em 2x a rotacao.",
  looseness: "Folga mecanica: pecas soltas ou base frouxa. Gera muitas harmonicas da rotacao.",
  bearing_outer: "Defeito na pista externa (fixa) do rolamento.",
  bearing_inner: "Defeito na pista interna (gira com o eixo) do rolamento.",
  bearing_ball: "Defeito em uma esfera/rolo do rolamento.",
  cavitation: "Cavitacao: bolhas colapsando em bombas. Ruido espalhado em banda larga, sem uma frequencia unica.",
  oil_whirl: "Whirl de oleo: instabilidade do filme de oleo em mancais de deslizamento. Vibra abaixo da rotacao (~0,45x).",
};

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
        <span className={s.headGroup}>
          <span className="eyebrow">Diagnostico</span>
          <InfoTip text="A conclusao do app sobre o que esta acontecendo na maquina, com o quanto ele confia. Abaixo, as outras hipoteses e as evidencias que sustentam a principal." />
        </span>
        <span className={s.confidence}>{confidence}</span>
      </div>

      <div className={s.verdict} style={{ borderLeft: `3px solid ${color}` }}>
        <span className={s.verdictName} style={{ color }}>
          {FAULT_LABELS[top.fault]}
        </span>
        <InfoTip text={FAULT_HELP[top.fault] ?? ""} align="center" />
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
