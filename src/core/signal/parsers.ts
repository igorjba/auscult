/**
 * Importers for real acquisitions: WAV (audio-style single channel), and CSV
 * (columnar time/amplitude exports from most data loggers). Both return the same
 * shape as the synthetic generator so the analysis pipeline is source-agnostic.
 */

export interface ParsedSignal {
  samples: Float64Array;
  sampleRate: number;
  source: string;
}

/**
 * Parse a PCM/IEEE-float WAV. Supports 16/24/32-bit integer and 32-bit float,
 * mono or multi-channel (channels are averaged to one). The sample rate comes from
 * the header, so acquisitions carry their own timebase.
 */
export function parseWav(buffer: ArrayBuffer, name = "wav"): ParsedSignal {
  const view = new DataView(buffer);
  const magic = readTag(view, 0);
  if (magic !== "RIFF" || readTag(view, 8) !== "WAVE") throw new Error("Arquivo WAV invalido");

  let offset = 12;
  let sampleRate = 0;
  let numChannels = 1;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readTag(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }
  if (dataOffset < 0 || sampleRate === 0) throw new Error("WAV sem chunk de dados");
  if (numChannels < 1 || numChannels > 64) throw new Error("WAV com numero de canais invalido");
  if (![8, 16, 24, 32, 64].includes(bitsPerSample)) throw new Error(`WAV: ${bitsPerSample} bits nao suportado`);

  const bytesPerSample = bitsPerSample / 8;
  // Never trust the header's declared data length over what the file actually holds:
  // a bloated value would drive frameCount past the buffer and read out of bounds.
  const availableBytes = Math.max(0, view.byteLength - dataOffset);
  const usableLength = Math.min(dataLength, availableBytes);
  const frameCount = Math.floor(usableLength / (bytesPerSample * numChannels));
  const out = new Float64Array(frameCount);
  const isFloat = audioFormat === 3;

  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    for (let c = 0; c < numChannels; c++) {
      const pos = dataOffset + (i * numChannels + c) * bytesPerSample;
      acc += readSample(view, pos, bitsPerSample, isFloat);
    }
    out[i] = acc / numChannels;
  }
  return { samples: out, sampleRate, source: name };
}

function readSample(view: DataView, pos: number, bits: number, isFloat: boolean): number {
  if (isFloat) return bits === 64 ? view.getFloat64(pos, true) : view.getFloat32(pos, true);
  switch (bits) {
    case 16:
      return view.getInt16(pos, true) / 32768;
    case 24: {
      const b0 = view.getUint8(pos);
      const b1 = view.getUint8(pos + 1);
      const b2 = view.getInt8(pos + 2);
      return ((b2 << 16) | (b1 << 8) | b0) / 8388608;
    }
    case 32:
      return view.getInt32(pos, true) / 2147483648;
    case 8:
      return (view.getUint8(pos) - 128) / 128;
    default:
      throw new Error(`WAV: ${bits} bits nao suportado`);
  }
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export interface CsvOptions {
  /** Sample rate if the file has no time column. */
  sampleRate?: number;
  /** Column index holding the amplitude; auto-detected if omitted. */
  valueColumn?: number;
}

/**
 * Parse a CSV/whitespace-delimited log. If a monotonically increasing first column
 * is detected it is treated as a time axis and the sample rate is derived from it;
 * otherwise the caller-supplied sample rate is used.
 */
export function parseCsv(text: string, options: CsvOptions = {}): ParsedSignal {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("CSV vazio");

  const delimiter = detectDelimiter(lines[0]);
  const rows: number[][] = [];
  for (const line of lines) {
    const cells = line.split(delimiter).map((c) => Number(c.trim()));
    if (cells.some((c) => !Number.isFinite(c))) continue; // header or bad row
    rows.push(cells);
  }
  if (rows.length < 2) throw new Error("CSV sem dados numericos suficientes");

  const width = rows[0].length;
  const hasTime = width >= 2 && isMonotonic(rows.map((r) => r[0]));
  const valueCol = options.valueColumn ?? (hasTime ? 1 : width - 1);

  const samples = Float64Array.from(rows, (r) => r[valueCol]);
  let sampleRate = options.sampleRate ?? 1;
  if (hasTime && rows.length > 1) {
    const dt = (rows[rows.length - 1][0] - rows[0][0]) / (rows.length - 1);
    if (dt > 0) sampleRate = 1 / dt;
  }
  return { samples, sampleRate, source: "csv" };
}

function detectDelimiter(line: string): string | RegExp {
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return /\s+/;
}

function isMonotonic(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) return false;
  return true;
}
