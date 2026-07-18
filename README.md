# auscult

Diagnóstico espectral de máquinas rotativas no navegador. Ingestão de sinal de vibração, FFT com janelamento, demodulação por envelope (Hilbert), cálculo das frequências de defeito de rolamento a partir da geometria, e um motor de diagnóstico de regra explícita com classificação de severidade por ISO 20816. Todo o processamento roda no cliente; o servidor não vê o sinal.

Analisa sinais sintéticos com falha injetada, arquivos WAV/CSV/MAT enviados pelo usuário, e casos reais do dataset de rolamentos da Case Western Reserve University.

## O que faz

- **DSP** — FFT radix-2 com fallback de Bluestein para comprimentos arbitrários; janelas Hann, Hamming, Blackman-Harris e flat-top com correção de ganho de amplitude e de energia; PSD por Welch; transformada de Hilbert e sinal analítico; integração aceleração→velocidade no domínio da frequência.
- **Análise de envelope** — banda de ressonância selecionada por curtose espectral, band-pass linear, demodulação Hilbert e espectro de envelope. É o que revela falha incipiente de rolamento, cuja assinatura está no *ritmo* dos impactos, não na ressonância que eles excitam.
- **Frequências de defeito** — BPFO, BPFI, BSF e FTF derivadas da geometria do rolamento (número de elementos, diâmetros, ângulo de contato), com escorregamento. Catálogo com os rolamentos de teste do CWRU.
- **Order tracking** — reamostragem angular para máquinas de rotação variável, com fase do eixo por tacômetro ou estimada (tacho-less) via fase instantânea do 1×.
- **Motor de diagnóstico** — regras explícitas e auditáveis (desbalanceamento, desalinhamento, folga, pista externa/interna/esfera, cavitação, whirl de óleo), cada hipótese acompanhada das evidências que a sustentam.
- **Severidade** — RMS de velocidade em banda (10–1000 Hz) classificado nas zonas A/B/C/D da ISO 10816-3 / 20816-3.
- **Waterfall** — espectrograma STFT com mapa de cores para acompanhar a evolução espectral ao longo do registro.
- **Casos** — persistência local em IndexedDB, com exportação/importação de casos em JSON. Sem conta, sem servidor.

## Validação

DSP determinístico é testável, e detecção de falha é falsificável quando há ground truth. Duas frentes de validação, ambas automatizadas em `npm test`.

### Sinais sintéticos (ground truth perfeito)

Gerador com física de falha injetada (trem de impactos excitando ressonância amortecida, modulação pela zona de carga, escorregamento, ruído gaussiano). 72 casos — 8 por classe — cobrindo 1200–3560 rpm, severidades e níveis de ruído variados.

```text
truth\pred     HLT   UNB   MIS   LOO  BPFO  BPFI   BSF   CAV  WHRL
HLT              8     .     .     .     .     .     .     .     .
UNB              .     8     .     .     .     .     .     .     .
MIS              .     .     8     .     .     .     .     .     .
LOO              .     .     .     8     .     .     .     .     .
BPFO             .     .     .     .     8     .     .     .     .
BPFI             .     .     .     .     .     8     .     .     .
BSF              .     .     .     .     .     .     8     .     .
CAV              .     .     .     .     .     .     .     8     .
WHRL             .     .     .     .     .     .     .     .     8

Acuracia: 100,0%  (n=72)
```

### Dados reais — Case Western Reserve University

Quatro registros de 12 kHz do mancal motriz (rolamento 6205, ~1797 rpm), com falha e tamanho conhecidos. O detector de envelope é rodado contra a verdade publicada pela universidade.

| Arquivo | Falha real          | Tamanho    | Diagnóstico            |     |
| ------- | ------------------- | ---------- | ---------------------- | --- |
| 97      | Saudável (baseline) | —          | Saudável               | ✓   |
| 105     | Pista interna       | 0,007 pol  | Pista interna          | ✓   |
| 130     | Pista externa       | 0,007 pol  | Pista externa          | ✓   |
| 118     | Esfera              | 0,007 pol  | Pista externa          | ✗   |

3 de 4. O defeito de esfera é o caso reconhecidamente difícil do dataset — sua energia se espalha e a linha 2×BSF raramente domina o envelope; a literatura reporta a menor taxa de acerto nessa classe. O detector ao menos o sinaliza como falha de rolamento, e não como máquina saudável.

A verificação de geometria de rolamento também é testada: as ordens derivadas para o 6205 batem com os fatores publicados pelo CWRU (BPFO 3,585×, BPFI 5,415×, FTF 0,398×, BSF 2,357×).

## Como o diagnóstico decide

As regras são físicas e legíveis, pontuadas por razões (invariantes à escala) para a forma e por amplitude absoluta para o nível:

| Assinatura                                                | Diagnóstico      |
| --------------------------------------------------------- | ---------------- |
| 1× grande e dominante, fase estável, poucas harmônicas    | Desbalanceamento |
| 2× comparável ou acima de 1× + série harmônica            | Desalinhamento   |
| série longa de harmônicas de 1× + meia-ordem              | Folga mecânica   |
| linha de BPFO dominante no envelope + harmônicas          | Pista externa    |
| BPFI dominante + bandas laterais de 1×                    | Pista interna    |
| 2×BSF dominante + bandas laterais da gaiola               | Esfera           |
| banda larga plana em 500 Hz–5 kHz, sem linha discreta     | Cavitação        |
| linha subsíncrona proeminente em 0,42–0,48×               | Whirl de óleo    |

Discriminadores-chave: a **curtose da banda de ressonância** separa fenômeno impulsivo (rolamento) de não-impulsivo; a **prominência e a dominância relativa** da linha de defeito no envelope separam falha real de pico de ruído e nomeiam o elemento defeituoso; a **amplitude absoluta** separa máquina saudável de falha.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- DSP em TypeScript puro, isolado atrás de uma interface e executado em **Web Worker** para não bloquear a UI
- **Canvas 2D** para espectros, envelope e waterfall
- **IndexedDB** para casos; **fflate** para descompactar MAT-files
- **Vitest** para os testes; sem dependências de runtime além de `fflate`

O DSP não depende de nenhuma biblioteca numérica: FFT, Hilbert, PSD e integração são implementados do zero e cobertos por testes (Parseval, quadratura Hilbert, RMS de banda, demodulação AM).

## Rodando localmente

```bash
npm install
npm run dev            # http://localhost:3000
```

```bash
npm test               # DSP, geometria de rolamento, validacao sintetica e CWRU
npm run validate       # imprime a matriz de confusao sintetica
npm run validate:cwru  # roda o detector contra os arquivos CWRU
npm run build          # build de producao
```

## Estrutura

```text
src/
  core/
    dsp/          FFT, janelas, spectrum/PSD, Hilbert, envelope, integracao, order tracking, STFT
    bearings.ts   geometria -> frequencias de defeito + catalogo
    signal/       gerador de falha, parsers WAV/CSV/MAT
    diagnosis/    extracao de features, motor de regras, severidade ISO
    validation/   suite sintetica + casos CWRU
    analyze.ts    pipeline ponta a ponta
  lib/            worker DSP, storage IndexedDB
  app/            UI Next.js (componentes de instrumento)
public/data/cwru/ registros CWRU (97, 105, 118, 130)
```

## Referências

- ISO 20816-3 / ISO 10816-3 — avaliação de vibração de máquinas por medições em partes não rotativas.
- Case Western Reserve University Bearing Data Center — dataset de rolamentos com falha.
- Randall, R. B.; Antoni, J. *Rolling element bearing diagnostics — a tutorial* (2011).
- McFadden, P. D.; Smith, J. D. *Model for the vibration produced by a single point defect in a rolling element bearing* (1984).
