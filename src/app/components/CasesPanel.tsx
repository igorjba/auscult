"use client";

import { useEffect, useRef, useState } from "react";
import { listCases, saveCase, deleteCase, exportCase, importCase, newId, type StoredCase } from "@/lib/storage";
import { FAULT_LABELS } from "@/core/signal/generator";
import type { AnalysisRequest } from "@/lib/types";
import type { AnalysisResult } from "@/core/analyze";
import s from "./controls.module.css";
import p from "./panels.module.css";

interface Props {
  current: AnalysisRequest | null;
  result: AnalysisResult | null;
  onLoad: (req: AnalysisRequest) => void;
}

export function CasesPanel({ current, result, onLoad }: Props) {
  const [cases, setCases] = useState<StoredCase[]>([]);
  const [name, setName] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = () => listCases().then(setCases).catch(() => undefined);
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    if (!current || !result) return;
    const c: StoredCase = {
      id: newId(),
      name: name.trim() || current.label,
      createdAt: Date.now(),
      source: current.label,
      sampleRate: current.sampleRate,
      rpm: current.rpm,
      unit: current.unit,
      accelInG: current.accelInG,
      bearingDesignation: current.bearingDesignation,
      samples: Array.from(current.samples),
      diagnosis: {
        fault: result.diagnosis.top.fault,
        score: result.diagnosis.top.score,
        zone: result.severity.zone,
        velocityRms: result.velocityRms,
      },
    };
    await saveCase(c);
    setName("");
    refresh();
  }

  function load(c: StoredCase) {
    onLoad({
      samples: Float64Array.from(c.samples),
      sampleRate: c.sampleRate,
      rpm: c.rpm,
      unit: c.unit,
      accelInG: c.accelInG,
      bearingDesignation: c.bearingDesignation,
      windowType: "hann",
      machineGroup: "group2",
      foundation: "rigid",
      waterfall: true,
      label: c.name,
    });
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteCase(id);
    refresh();
  }

  function download(c: StoredCase, e: React.MouseEvent) {
    e.stopPropagation();
    const blob = new Blob([exportCase(c)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const c = importCase(await file.text());
      c.id = newId();
      await saveCase(c);
      refresh();
    } catch {
      /* ignore malformed import */
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  return (
    <div className={p.panel}>
      <div className={p.header}>
        <span className="eyebrow">Casos salvos</span>
        <span className={p.confidence}>{cases.length} no navegador</span>
      </div>

      <div className={s.saveRow}>
        <input
          className="input"
          placeholder={current ? "Nome do caso…" : "Analise um sinal primeiro"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!current}
        />
        <button className="btn btn-sm" onClick={save} disabled={!current || !result}>
          Salvar
        </button>
      </div>

      {cases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {cases.map((c) => (
            <button key={c.id} className={s.cwruCard} onClick={() => load(c)} style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className={s.cwruLabel} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
                <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <span className={s.cwruId} onClick={(e) => download(c, e)} style={{ cursor: "pointer" }} title="Exportar JSON">
                    ↓
                  </span>
                  <span className={s.cwruId} onClick={(e) => remove(c.id, e)} style={{ cursor: "pointer" }} title="Excluir">
                    ✕
                  </span>
                </span>
              </div>
              <div className={s.cwruMeta}>
                {FAULT_LABELS[c.diagnosis.fault]} · zona {c.diagnosis.zone} · {c.diagnosis.velocityRms.toFixed(2)} mm/s
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => importInput.current?.click()}>
          Importar caso (JSON)
        </button>
        <input ref={importInput} type="file" accept=".json" hidden onChange={onImport} />
      </div>
    </div>
  );
}
