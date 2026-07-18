"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateSignal, FAULT_LABELS, type FaultType } from "@/core/signal/generator";
import { parseWav, parseCsv } from "@/core/signal/parsers";
import { parseMat, extractCwru } from "@/core/signal/mat";
import { BEARING_CATALOG, type BearingGeometry } from "@/core/bearings";
import { WINDOW_LABELS, type WindowType } from "@/core/dsp";
import { CWRU_CASES } from "@/core/validation/cwru";
import type { AnalysisRequest } from "@/lib/types";
import s from "./controls.module.css";

type SourceMode = "synthetic" | "file" | "cwru";

const GEN_FAULTS: FaultType[] = [
  "healthy",
  "unbalance",
  "misalignment",
  "looseness",
  "bearing_outer",
  "bearing_inner",
  "bearing_ball",
  "cavitation",
  "oil_whirl",
];

interface Props {
  onAnalyze: (req: AnalysisRequest) => void;
  busy: boolean;
}

export function ControlPanel({ onAnalyze, busy }: Props) {
  const [mode, setMode] = useState<SourceMode>("synthetic");
  const [error, setError] = useState<string | null>(null);

  // Generator state.
  const [fault, setFault] = useState<FaultType>("bearing_outer");
  const [rpm, setRpm] = useState(1797);
  const [severity, setSeverity] = useState(0.7);
  const [noise, setNoise] = useState(0.05);

  // File state.
  const [fileSampleRate, setFileSampleRate] = useState(12000);
  const [fileRpm, setFileRpm] = useState(1797);
  const [fileUnit, setFileUnit] = useState<"acceleration" | "velocity">("acceleration");

  // Analysis params (shared).
  const [bearing, setBearing] = useState("6205-2RS JEM SKF");
  const [customGeo, setCustomGeo] = useState<BearingGeometry>({
    rollingElements: 8,
    ballDiameter: 12,
    pitchDiameter: 60,
    contactAngle: 0,
  });
  const isCustom = bearing === "custom";
  const [windowType, setWindowType] = useState<WindowType>("hann");
  const [machineGroup, setMachineGroup] = useState<"group1" | "group2">("group2");
  const [foundation, setFoundation] = useState<"rigid" | "flexible">("rigid");
  const [waterfall, setWaterfall] = useState(true);

  const fileInput = useRef<HTMLInputElement>(null);
  const lastSource = useRef<Omit<AnalysisRequest, "windowType" | "machineGroup" | "foundation" | "waterfall" | "bearingDesignation"> | null>(null);

  const geometry = isCustom ? customGeo : undefined;

  const dispatch = useCallback(
    (src: Omit<AnalysisRequest, "windowType" | "machineGroup" | "foundation" | "waterfall" | "bearingDesignation">) => {
      lastSource.current = src;
      onAnalyze({ ...src, bearingDesignation: bearing, bearingGeometry: geometry, windowType, machineGroup, foundation, waterfall });
    },
    [onAnalyze, bearing, geometry, windowType, machineGroup, foundation, waterfall],
  );

  // Re-run when an analysis parameter changes and a signal is already loaded.
  useEffect(() => {
    if (lastSource.current) {
      onAnalyze({ ...lastSource.current, bearingDesignation: bearing, bearingGeometry: geometry, windowType, machineGroup, foundation, waterfall });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearing, customGeo, windowType, machineGroup, foundation, waterfall]);

  function generate() {
    setError(null);
    const sig = generateSignal({
      fault,
      rpm,
      sampleRate: 25600,
      duration: 1.2,
      severity,
      noise,
      seed: Math.floor(Math.random() * 1e6),
      bearingDesignation: bearing,
      bearingGeometry: geometry,
    });
    dispatch({
      samples: sig.samples,
      sampleRate: sig.sampleRate,
      rpm,
      unit: "velocity",
      label: `Sintetico · ${FAULT_LABELS[fault]}`,
      truth: fault,
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "wav") {
        const parsed = parseWav(await file.arrayBuffer(), file.name);
        dispatch({ samples: parsed.samples, sampleRate: parsed.sampleRate, rpm: fileRpm, unit: fileUnit, accelInG: fileUnit === "acceleration", label: file.name });
      } else if (ext === "csv" || ext === "txt") {
        const parsed = parseCsv(await file.text(), { sampleRate: fileSampleRate });
        const sr = parsed.sampleRate > 1 ? parsed.sampleRate : fileSampleRate;
        dispatch({ samples: parsed.samples, sampleRate: sr, rpm: fileRpm, unit: fileUnit, accelInG: fileUnit === "acceleration", label: file.name });
      } else if (ext === "mat") {
        const cw = extractCwru(parseMat(await file.arrayBuffer()));
        dispatch({ samples: cw.samples, sampleRate: fileSampleRate, rpm: cw.rpm ?? fileRpm, unit: "acceleration", accelInG: true, label: file.name });
      } else {
        setError("Formato nao suportado. Use WAV, CSV ou MAT.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler arquivo");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function loadCwru(id: string) {
    setError(null);
    const c = CWRU_CASES.find((x) => x.id === id)!;
    try {
      const res = await fetch(c.file);
      if (!res.ok) throw new Error(`Nao foi possivel carregar ${c.file}`);
      const cw = extractCwru(parseMat(await res.arrayBuffer()));
      setBearing(c.bearing);
      dispatch({
        samples: cw.samples,
        sampleRate: c.sampleRate,
        rpm: cw.rpm ?? c.rpm,
        unit: "acceleration",
        accelInG: true,
        label: `CWRU ${c.id} · ${c.label}`,
        truth: c.truth,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar CWRU");
    }
  }

  return (
    <div className={s.panel}>
      <div className={s.tabs}>
        {(["synthetic", "file", "cwru"] as SourceMode[]).map((m) => (
          <button key={m} className={`${s.tab} ${mode === m ? s.tabActive : ""}`} onClick={() => setMode(m)}>
            {m === "synthetic" ? "Gerador" : m === "file" ? "Arquivo" : "CWRU"}
          </button>
        ))}
      </div>

      {mode === "synthetic" && (
        <div className={s.grid1}>
          <div className="field">
            <label>Falha injetada</label>
            <select className="select" value={fault} onChange={(e) => setFault(e.target.value as FaultType)}>
              {GEN_FAULTS.map((f) => (
                <option key={f} value={f}>
                  {FAULT_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className={s.grid2}>
            <div className="field">
              <label>Rotacao (RPM)</label>
              <input className="input" type="number" value={rpm} min={300} max={12000} step={1} onChange={(e) => setRpm(Number(e.target.value))} />
            </div>
            <div className={s.sliderRow}>
              <div className={s.sliderHead}>
                <span>Severidade</span>
                <span className={s.sliderVal}>{severity.toFixed(2)}</span>
              </div>
              <input type="range" min={0.1} max={1} step={0.05} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
            </div>
          </div>
          <div className={s.sliderRow}>
            <div className={s.sliderHead}>
              <span>Ruido de fundo</span>
              <span className={s.sliderVal}>{noise.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={0.3} step={0.01} value={noise} onChange={(e) => setNoise(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={busy}>
            {busy ? "Analisando…" : "Gerar e analisar"}
          </button>
        </div>
      )}

      {mode === "file" && (
        <div className={s.grid1}>
          <div className={s.dropzone} onClick={() => fileInput.current?.click()}>
            <strong>Carregar arquivo</strong>
            <div className={s.hint}>WAV · CSV · MAT (Case Western)</div>
          </div>
          <input ref={fileInput} type="file" accept=".wav,.csv,.txt,.mat" hidden onChange={onFile} />
          <div className={s.grid2}>
            <div className="field">
              <label>Taxa de amostragem (Hz)</label>
              <input className="input" type="number" value={fileSampleRate} onChange={(e) => setFileSampleRate(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Rotacao (RPM)</label>
              <input className="input" type="number" value={fileRpm} onChange={(e) => setFileRpm(Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label>Grandeza do sinal</label>
            <select className="select" value={fileUnit} onChange={(e) => setFileUnit(e.target.value as "acceleration" | "velocity")}>
              <option value="acceleration">Aceleracao (g)</option>
              <option value="velocity">Velocidade (mm/s)</option>
            </select>
          </div>
          <div className={s.hint}>CSV: coluna de tempo detectada automaticamente; senao usa a taxa acima. MAT: canal drive-end e RPM lidos do arquivo.</div>
        </div>
      )}

      {mode === "cwru" && (
        <div className={s.grid1}>
          <div className={s.cwruGrid}>
            {CWRU_CASES.map((c) => (
              <button key={c.id} className={s.cwruCard} onClick={() => loadCwru(c.id)} disabled={busy}>
                <div className={s.cwruId}>#{c.id}</div>
                <div className={s.cwruLabel}>{c.label}</div>
                <div className={s.cwruMeta}>
                  {c.faultSize} · {c.rpm} rpm
                </div>
              </button>
            ))}
          </div>
          <div className={s.hint}>
            Dados reais do Bearing Data Center (CWRU), 12 kHz, rolamento 6205. Ground truth conhecido — a matriz de confusao esta no README.
          </div>
        </div>
      )}

      {error && <div className={s.error}>{error}</div>}

      <div className={s.divider} />

      <div className={s.grid1}>
        <div className="field">
          <label>Rolamento</label>
          <select className="select" value={bearing} onChange={(e) => setBearing(e.target.value)}>
            {BEARING_CATALOG.map((b) => (
              <option key={b.designation} value={b.designation}>
                {b.designation}
              </option>
            ))}
            <option value="custom">— Geometria personalizada —</option>
          </select>
        </div>

        {isCustom && (
          <div className={s.grid2}>
            <div className="field">
              <label>Elementos (Nb)</label>
              <input
                className="input"
                type="number"
                min={3}
                max={40}
                value={customGeo.rollingElements}
                onChange={(e) => setCustomGeo({ ...customGeo, rollingElements: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Ang. contato (°)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={45}
                step={1}
                value={Math.round((customGeo.contactAngle * 180) / Math.PI)}
                onChange={(e) => setCustomGeo({ ...customGeo, contactAngle: (Number(e.target.value) * Math.PI) / 180 })}
              />
            </div>
            <div className="field">
              <label>Diam. esfera (mm)</label>
              <input
                className="input"
                type="number"
                min={1}
                step={0.01}
                value={customGeo.ballDiameter}
                onChange={(e) => setCustomGeo({ ...customGeo, ballDiameter: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Diam. primitivo (mm)</label>
              <input
                className="input"
                type="number"
                min={1}
                step={0.01}
                value={customGeo.pitchDiameter}
                onChange={(e) => setCustomGeo({ ...customGeo, pitchDiameter: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        <div className={s.grid2}>
          <div className="field">
            <label>Janela FFT</label>
            <select className="select" value={windowType} onChange={(e) => setWindowType(e.target.value as WindowType)}>
              {(Object.keys(WINDOW_LABELS) as WindowType[]).map((w) => (
                <option key={w} value={w}>
                  {WINDOW_LABELS[w]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Grupo ISO</label>
            <select className="select" value={machineGroup} onChange={(e) => setMachineGroup(e.target.value as "group1" | "group2")}>
              <option value="group2">Grupo 2 (15–300 kW)</option>
              <option value="group1">Grupo 1 (&gt; 300 kW)</option>
            </select>
          </div>
        </div>
        <div className={s.grid2}>
          <div className="field">
            <label>Fundacao</label>
            <select className="select" value={foundation} onChange={(e) => setFoundation(e.target.value as "rigid" | "flexible")}>
              <option value="rigid">Rigida</option>
              <option value="flexible">Flexivel</option>
            </select>
          </div>
          <label className="field" style={{ justifyContent: "flex-end", cursor: "pointer" }}>
            <label>Cascata / waterfall</label>
            <button className="btn btn-sm" onClick={() => setWaterfall((w) => !w)} style={{ justifyContent: "space-between" }}>
              <span>{waterfall ? "Ativado" : "Desativado"}</span>
              <span style={{ color: waterfall ? "var(--accent)" : "var(--text-faint)" }}>●</span>
            </button>
          </label>
        </div>
      </div>
    </div>
  );
}
