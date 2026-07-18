"use client";

import { useCallback, useState } from "react";
import { useDsp } from "@/lib/useDsp";
import type { AnalysisResult } from "@/core/analyze";
import type { Waterfall } from "@/core/dsp";
import type { AnalysisRequest } from "@/lib/types";
import { FAULT_LABELS } from "@/core/signal/generator";
import { ControlPanel } from "./ControlPanel";
import { CasesPanel } from "./CasesPanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { SeverityPanel } from "./SeverityPanel";
import { BearingPanel } from "./BearingPanel";
import { SpectrumChart, type Marker } from "./SpectrumChart";
import { WaterfallChart } from "./WaterfallChart";
import a from "./app.module.css";

export function AnalyzerApp() {
  const { process } = useDsp();
  const [request, setRequest] = useState<AnalysisRequest | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [waterfall, setWaterfall] = useState<Waterfall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAnalyze = useCallback(
    async (req: AnalysisRequest) => {
      setBusy(true);
      setError(null);
      setRequest(req);
      try {
        const res = await process({
          samples: req.samples,
          sampleRate: req.sampleRate,
          rpm: req.rpm,
          unit: req.unit,
          accelInG: req.accelInG,
          bearingDesignation: req.bearingDesignation,
          bearingGeometry: req.bearingGeometry,
          windowType: req.windowType,
          machineGroup: req.machineGroup,
          foundation: req.foundation,
          waterfall: req.waterfall,
        });
        if (!res.ok) throw new Error(res.error);
        setResult(res.analysis ?? null);
        setWaterfall(res.waterfall ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha na analise");
      } finally {
        setBusy(false);
      }
    },
    [process],
  );

  const shaftRate = result?.shaftRate ?? 0;
  const nyquist = request ? request.sampleRate / 2 : 1;

  const harmonicMarkers: Marker[] = result
    ? [1, 2, 3, 4].map((k) => ({ freq: k * shaftRate, label: `${k}×`, color: "var(--accent)", dashed: k > 1 }))
    : [];

  const defectMarkers: Marker[] = result
    ? [
        { freq: result.defects.bpfo, label: "BPFO", color: "var(--zone-d)" },
        { freq: result.defects.bpfi, label: "BPFI", color: "#ff7a85" },
        { freq: result.defects.bsf, label: "2×BSF", color: "var(--amber)" },
        { freq: result.defects.ftf, label: "FTF", color: "var(--violet)" },
      ]
    : [];

  const velXMax = result ? Math.min(nyquist, Math.max(1000, 12 * shaftRate)) : undefined;
  const envXMax = result ? Math.min(result.envelopeSpectrum.sampleRate / 2, 14 * shaftRate) : undefined;

  return (
    <div className={a.shell}>
      <header className={a.topbar}>
        <div className={a.brand}>
          <svg className={a.logo} viewBox="0 0 34 34" fill="none" aria-hidden>
            <rect x="1" y="1" width="32" height="32" rx="8" stroke="var(--accent)" strokeOpacity="0.5" />
            <path
              d="M5 17 h4 l2 -9 l3 18 l3 -13 l2 8 l2 -5 h8"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <div className={a.brandText}>
            <h1>auscult</h1>
            <p>Diagnostico espectral de maquinas rotativas</p>
          </div>
        </div>
        <div className={a.topMeta}>
          <span className="tag">FFT · envelope · ISO 20816</span>
          <a className="tag" href="https://github.com/igorjba/auscult" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </header>

      <div className={a.layout}>
        <aside className={a.sidebar}>
          <ControlPanel onAnalyze={onAnalyze} busy={busy} />
          <CasesPanel current={request} result={result} onLoad={onAnalyze} />
        </aside>

        <main className={a.main}>
          {error && (
            <div className={a.chartPanel} style={{ color: "var(--zone-d)" }}>
              {error}
            </div>
          )}

          {!result && !error && (
            <div className={`${a.chartPanel} ${a.empty}`}>
              <div className={a.emptyInner}>
                <h3>Nenhum sinal analisado</h3>
                <p>
                  Gere um sinal sintetico com falha injetada, carregue um WAV/CSV/MAT, ou abra um caso real do dataset
                  Case Western. O diagnostico, as frequencias de defeito e o waterfall aparecem aqui.
                </p>
              </div>
            </div>
          )}

          {result && request && (
            <>
              <div className={a.summaryRow}>
                <DiagnosisPanel diagnosis={result.diagnosis} />
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <SeverityPanel severity={result.severity} />
                  <TruthCard request={request} predicted={result.diagnosis.top.fault} />
                </div>
              </div>

              <BearingPanel defects={result.defects} bearing={result.bearing} />

              <div className={a.chartPanel}>
                <div className={a.chartHead}>
                  <span className={a.chartTitle}>Espectro — {request.unit === "acceleration" ? "velocidade integrada" : "velocidade"}</span>
                  <span className={a.chartSub}>
                    1× = {shaftRate.toFixed(2)} Hz · Δf = {result.velocitySpectrum.freqResolution.toFixed(2)} Hz
                  </span>
                </div>
                <SpectrumChart
                  freqs={result.velocitySpectrum.freqs}
                  values={result.velocitySpectrum.amplitude}
                  markers={harmonicMarkers}
                  xMax={velXMax}
                  unit="mm/s"
                  color="var(--accent)"
                />
                <div className={a.legend}>
                  <span className={a.legendItem}>
                    <span className={a.swatch} style={{ background: "var(--accent)" }} /> harmonicas de 1×
                  </span>
                </div>
              </div>

              <div className={a.chartPanel}>
                <div className={a.chartHead}>
                  <span className={a.chartTitle}>Espectro de envelope (demodulacao Hilbert)</span>
                  <span className={a.chartSub}>
                    banda {result.resonanceBand[0].toFixed(0)}–{result.resonanceBand[1].toFixed(0)} Hz
                  </span>
                </div>
                <SpectrumChart
                  freqs={result.envelopeSpectrum.freqs}
                  values={result.envelopeSpectrum.amplitude}
                  markers={defectMarkers}
                  xMax={envXMax}
                  color="var(--amber)"
                />
                <div className={a.legend}>
                  <span className={a.legendItem}>
                    <span className={a.swatch} style={{ background: "var(--zone-d)" }} /> BPFO
                  </span>
                  <span className={a.legendItem}>
                    <span className={a.swatch} style={{ background: "#ff7a85" }} /> BPFI
                  </span>
                  <span className={a.legendItem}>
                    <span className={a.swatch} style={{ background: "var(--amber)" }} /> 2×BSF
                  </span>
                  <span className={a.legendItem}>
                    <span className={a.swatch} style={{ background: "var(--violet)" }} /> FTF
                  </span>
                </div>
              </div>

              {waterfall && waterfall.magnitudes.length > 1 && (
                <div className={a.chartPanel}>
                  <div className={a.chartHead}>
                    <span className={a.chartTitle}>Waterfall (STFT)</span>
                    <span className={a.chartSub}>{waterfall.magnitudes.length} quadros</span>
                  </div>
                  <WaterfallChart waterfall={waterfall} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TruthCard({ request, predicted }: { request: AnalysisRequest; predicted: string }) {
  if (!request.truth) {
    return (
      <div className={a.chartPanel} style={{ padding: "14px 16px" }}>
        <span className="eyebrow">Fonte</span>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-dim)" }}>{request.label}</div>
        <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-faint)" }}>
          {request.rpm} rpm · {(request.sampleRate / 1000).toFixed(1)} kHz · {request.samples.length.toLocaleString("pt-BR")} amostras
        </div>
      </div>
    );
  }
  const ok = predicted === request.truth;
  return (
    <div className={a.chartPanel} style={{ padding: "14px 16px" }}>
      <span className="eyebrow">Validacao — ground truth</span>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className={`${a.truthBadge} ${ok ? a.truthOk : a.truthMiss}`}>
          {ok ? "✓ acerto" : "✗ divergencia"}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          real: <strong>{FAULT_LABELS[request.truth]}</strong>
        </span>
      </div>
      <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-faint)" }}>
        {request.label}
      </div>
    </div>
  );
}
