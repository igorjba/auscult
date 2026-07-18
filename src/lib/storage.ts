/**
 * Case storage in IndexedDB. A "case" is a saved acquisition — its raw samples plus
 * the metadata needed to re-analyse it and the headline diagnosis. Everything lives
 * in the browser: no account, no server round-trip, works offline. Cases can be
 * exported to and imported from a plain JSON file to move between machines.
 */

import type { FaultType } from "@/core/signal/generator";
import type { SignalUnit } from "@/core/analyze";
import { assertSampleCount } from "./limits";

const DB_NAME = "auscult";
const STORE = "cases";
const VERSION = 1;

export interface StoredCase {
  id: string;
  name: string;
  createdAt: number;
  source: string;
  sampleRate: number;
  rpm: number;
  unit: SignalUnit;
  accelInG?: boolean;
  bearingDesignation: string;
  samples: number[]; // stored as plain array for structured-clone + JSON portability
  diagnosis: {
    fault: FaultType;
    score: number;
    zone: string;
    velocityRms: number;
  };
  note?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function saveCase(c: StoredCase): Promise<void> {
  await tx("readwrite", (s) => s.put(c));
}

export async function listCases(): Promise<StoredCase[]> {
  const all = await tx<StoredCase[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCase(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export function exportCase(c: StoredCase): string {
  return JSON.stringify(c, null, 2);
}

const UNITS: SignalUnit[] = ["velocity", "acceleration", "displacement"];

/**
 * Parse an imported case JSON into a clean, validated StoredCase. A case file can
 * come from anywhere, so nothing from it is trusted: fields are type-checked and a
 * fresh object is built (never the parsed input), so unexpected or prototype-polluting
 * keys can't ride along, and an oversized or non-numeric sample array is rejected
 * before it reaches storage or the worker.
 */
export function importCase(json: string): StoredCase {
  const p = JSON.parse(json) as Record<string, unknown>;
  if (!p || typeof p !== "object") throw new Error("Caso invalido");
  if (!Array.isArray(p.samples)) throw new Error("Caso sem amostras");
  assertSampleCount(p.samples.length);

  const samples = p.samples.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error("Amostra nao numerica no caso importado");
    return n;
  });

  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 200) : fallback);
  const posNum = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
  const d = (p.diagnosis ?? {}) as Record<string, unknown>;

  return {
    id: str(p.id, newId()) || newId(),
    name: str(p.name, "Caso importado"),
    createdAt: typeof p.createdAt === "number" && Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
    source: str(p.source, "importado"),
    sampleRate: posNum(p.sampleRate, 12000),
    rpm: posNum(p.rpm, 1797),
    unit: UNITS.includes(p.unit as SignalUnit) ? (p.unit as SignalUnit) : "acceleration",
    accelInG: p.accelInG === true,
    bearingDesignation: str(p.bearingDesignation, "6205-2RS JEM SKF"),
    samples,
    diagnosis: {
      fault: str(d.fault, "healthy") as FaultType,
      score: typeof d.score === "number" && Number.isFinite(d.score) ? d.score : 0,
      zone: str(d.zone, "A"),
      velocityRms: typeof d.velocityRms === "number" && Number.isFinite(d.velocityRms) ? d.velocityRms : 0,
    },
  };
}

export function newId(): string {
  return `case_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
