"use client";

import type { DefectFrequencies, BearingSpec } from "@/core/bearings";
import { defectOrders } from "@/core/bearings";
import s from "./panels.module.css";

const DEFECTS = [
  { key: "bpfo", name: "BPFO", label: "Pista externa", order: "bpfo", color: "var(--zone-d)" },
  { key: "bpfi", name: "BPFI", label: "Pista interna", order: "bpfi", color: "var(--zone-d)" },
  { key: "bsf", name: "2×BSF", label: "Esfera", order: "bsf", color: "var(--amber)" },
  { key: "ftf", name: "FTF", label: "Gaiola", order: "ftf", color: "var(--violet)" },
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
        <span className="eyebrow">Frequencias de defeito</span>
        <span className={s.confidence}>{bearing.designation}</span>
      </div>
      <div className={s.freqGrid}>
        {DEFECTS.map((d) => (
          <div key={d.key} className={s.freqCell} style={{ borderLeftColor: d.color }}>
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
