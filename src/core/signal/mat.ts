/**
 * Minimal MATLAB Level-5 MAT-file reader — enough to load the Case Western Reserve
 * University bearing dataset in the browser.
 *
 * The CWRU files store each acquisition as a double array named like `X105_DE_time`
 * (drive-end accelerometer), `X105_FE_time` (fan end) and `X105_RPM`. This reader
 * walks the MAT data elements, inflating the zlib-compressed matrix payloads, and
 * returns the named numeric arrays. It deliberately handles only what the dataset
 * uses (numeric matrices, real part, double/single/int classes) rather than the
 * whole MAT-file spec.
 */

import { inflateSync } from "fflate";

const MI_INT8 = 1;
const MI_UINT8 = 2;
const MI_INT16 = 3;
const MI_UINT16 = 4;
const MI_INT32 = 5;
const MI_UINT32 = 6;
const MI_SINGLE = 7;
const MI_DOUBLE = 9;
const MI_INT64 = 12;
const MI_UINT64 = 13;
const MI_MATRIX = 14;
const MI_COMPRESSED = 15;
const MI_UTF8 = 16;

export interface MatVariable {
  name: string;
  data: Float64Array;
  dims: number[];
}

export function parseMat(buffer: ArrayBuffer): Record<string, MatVariable> {
  const view = new DataView(buffer);
  if (view.byteLength < 128) throw new Error("MAT invalido (cabecalho curto)");

  // Endianness from the 'MI'/'IM' marker at byte 126.
  const marker = view.getUint16(126, false);
  const little = marker === 0x494d; // 'IM' little-endian
  const variables: Record<string, MatVariable> = {};

  let offset = 128;
  while (offset + 8 <= view.byteLength) {
    const { type, size, dataStart, next } = readTag(view, offset, little);
    if (type === MI_COMPRESSED) {
      const compressed = new Uint8Array(buffer, dataStart, size);
      const inflated = inflateSync(compressed);
      const dv = new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength);
      const v = readMatrix(dv, 0, little);
      if (v) variables[v.name] = v;
    } else if (type === MI_MATRIX) {
      const v = readMatrix(view, dataStart, little);
      if (v) variables[v.name] = v;
    }
    offset = next;
  }
  return variables;
}

interface Tag {
  type: number;
  size: number;
  dataStart: number;
  next: number;
}

function readTag(view: DataView, offset: number, little: boolean): Tag {
  const first = view.getUint32(offset, little);
  // Small-element format: upper 16 bits hold the byte size when non-zero.
  const smallSize = (first >> 16) & 0xffff;
  if (smallSize !== 0) {
    const type = first & 0xffff;
    return { type, size: smallSize, dataStart: offset + 4, next: offset + 8 };
  }
  const type = first;
  const size = view.getUint32(offset + 4, little);
  const padded = size + ((8 - (size % 8)) % 8);
  return { type, size, dataStart: offset + 8, next: offset + 8 + padded };
}

function readMatrix(view: DataView, start: number, little: boolean): MatVariable | null {
  let offset = start;
  // Array flags subelement (we don't need the class beyond skipping it).
  const flags = readTag(view, offset, little);
  offset = flags.next;
  // Dimensions.
  const dimsTag = readTag(view, offset, little);
  const nDims = dimsTag.size / 4;
  const dims: number[] = [];
  for (let i = 0; i < nDims; i++) dims.push(view.getInt32(dimsTag.dataStart + i * 4, little));
  offset = dimsTag.next;
  // Name.
  const nameTag = readTag(view, offset, little);
  let name = "";
  for (let i = 0; i < nameTag.size; i++) name += String.fromCharCode(view.getUint8(nameTag.dataStart + i));
  offset = nameTag.next;
  // Real part (pr). Numeric only.
  const prTag = readTag(view, offset, little);
  const data = readNumericArray(view, prTag, little);
  if (!data) return null;
  return { name, data, dims };
}

function readNumericArray(view: DataView, tag: Tag, little: boolean): Float64Array | null {
  const { type, size, dataStart } = tag;
  const readers: Record<number, [number, (o: number) => number]> = {
    [MI_DOUBLE]: [8, (o) => view.getFloat64(o, little)],
    [MI_SINGLE]: [4, (o) => view.getFloat32(o, little)],
    [MI_INT8]: [1, (o) => view.getInt8(o)],
    [MI_UINT8]: [1, (o) => view.getUint8(o)],
    [MI_INT16]: [2, (o) => view.getInt16(o, little)],
    [MI_UINT16]: [2, (o) => view.getUint16(o, little)],
    [MI_INT32]: [4, (o) => view.getInt32(o, little)],
    [MI_UINT32]: [4, (o) => view.getUint32(o, little)],
    [MI_INT64]: [8, (o) => Number(view.getBigInt64(o, little))],
    [MI_UINT64]: [8, (o) => Number(view.getBigUint64(o, little))],
    [MI_UTF8]: [1, (o) => view.getUint8(o)],
  };
  const r = readers[type];
  if (!r) return null;
  const [bytes, read] = r;
  const count = Math.floor(size / bytes);
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) out[i] = read(dataStart + i * bytes);
  return out;
}

export interface CwruSignal {
  samples: Float64Array;
  rpm?: number;
  channel: string;
}

/**
 * Pull the drive-end (preferred) or fan-end acceleration channel and the RPM out of
 * a parsed CWRU file, regardless of the numeric id embedded in the variable names.
 */
export function extractCwru(variables: Record<string, MatVariable>): CwruSignal {
  const names = Object.keys(variables);
  const de = names.find((n) => /_DE_time$/.test(n));
  const fe = names.find((n) => /_FE_time$/.test(n));
  const rpmName = names.find((n) => /_?RPM$/i.test(n));
  const channelName = de ?? fe;
  if (!channelName) throw new Error("Arquivo CWRU sem canal *_DE_time ou *_FE_time");
  const rpm = rpmName ? variables[rpmName].data[0] : undefined;
  return { samples: variables[channelName].data, rpm, channel: de ? "drive-end" : "fan-end" };
}
