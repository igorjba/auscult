"use client";

import type { DefectFrequencies, BearingSpec } from "@/core/bearings";
import { defectOrders } from "@/core/bearings";
import { InfoTip } from "./InfoTip";
import s from "./panels.module.css";

const DEFECTS = [
  { key: "bpfo", name: "BPFO", label: "Pista externa", color: "var(--zone-d)", help: "Batidas por defeito na pista externa (fixa) do rolamento." },
  { key: "bpfi", name: "BPFI", label: "Pista interna", color: "var(--zone-d)", help: "Batidas por defeito na pista interna, que gira com o eixo." },
  { key: "bsf", name: "2×BSF", label: "Esfera", color: "var(--amber)", help: "Rotacao de uma esfera; um defeito nela toca as duas pistas por giro." },
  { key: "ftf", name: "FTF", label: "Gaiola", color: "var(--violet)", help: "Frequencia da gaiola que mantem as esferas espacadas." },
] as const;

export function BearingPanel({ defects, bearing }: { defects: DefectFrequencies; bearing: BearingSpec }) {
  const orders = defectOrders(bearing);
  const orderMap: Record<string, number> = { bpfo: orders.bpfo, bpfi: orders.bpfi, bsf: 2 * orders.bsf, ftf: orders.ftf };
  const freqMap: Record<string, number> = {
    bpfo: defects.bpfo,
    bpfi: defects.bpfi,
    bsf: defects.bsf,
    ftf: defects.ftf,
  };

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className={s.headGroup}>
          <span className="eyebrow">Frequencias de defeito</span>
          <InfoTip text="Cada defeito num rolamento produz batidas numa frequencia propria, calculada pelas medidas do rolamento e pela rotacao. O app procura essas frequencias no espectro de envelope para achar qual peca falhou. Passe o mouse em cada uma." />
        </span>
        <span className={s.confidence}>{bearing.designation}</span>
      </div>
      <div className={s.freqGrid}>
        {DEFECTS.map((d) => (
          <div key={d.key} className={s.freqCell} style={{ borderLeftColor: d.color }} title={d.help}>
            <div className={s.freqName}>
              <span>{d.name}</span>
              <span className={s.freqOrder}>{orderMap[d.key].toFixed(3)}×</span>
            </div>
            <div className={s.freqValue} style={{ color: d.color }}>
              {freqMap[d.key].toFixed(1)} <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Hz</span>
            </div>
            <div className={s.freqOrder}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
