"use client";

/**
 * Client hook around the DSP worker. Spins up a single worker for the component
 * tree and exposes a promise-based `process` call, matching responses to requests by
 * id so several analyses can be in flight without crossing wires.
 */

import { useCallback, useEffect, useRef } from "react";
import type { ProcessRequest, ProcessResponse } from "./dsp.worker";

type Pending = { resolve: (r: ProcessResponse) => void; reject: (e: Error) => void };

export function useDsp() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);

  useEffect(() => {
    const worker = new Worker(new URL("./dsp.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      const p = pending.current.get(e.data.id);
      if (!p) return;
      pending.current.delete(e.data.id);
      p.resolve(e.data);
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const process = useCallback((req: Omit<ProcessRequest, "id">): Promise<ProcessResponse> => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Worker indisponivel"));
    const id = nextId.current++;
    return new Promise<ProcessResponse>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      worker.postMessage({ ...req, id });
    });
  }, []);

  return { process };
}
