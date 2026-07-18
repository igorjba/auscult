/**
 * Case storage in IndexedDB. A "case" is a saved acquisition — its raw samples plus
 * the metadata needed to re-analyse it and the headline diagnosis. Everything lives
 * in the browser: no account, no server round-trip, works offline. Cases can be
 * exported to and imported from a plain JSON file to move between machines.
 */

import type { FaultType } from "@/core/signal/generator";
import type { SignalUnit } from "@/core/analyze";

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

export function importCase(json: string): StoredCase {
  const parsed = JSON.parse(json) as StoredCase;
  if (!parsed.id || !Array.isArray(parsed.samples)) throw new Error("Caso invalido");
  return parsed;
}

export function newId(): string {
  return `case_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
