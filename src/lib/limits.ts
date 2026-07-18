/**
 * Guard rails for untrusted input. The app runs entirely in the browser and never
 * shares files between users, so the threat is a user loading a huge or malformed
 * file (by accident or to crash their own tab), not a remote attacker. These caps
 * keep a bad file from exhausting memory or wedging the worker.
 */

/** Largest upload accepted, in bytes. Real vibration records are a few MB. */
export const MAX_FILE_BYTES = 96 * 1024 * 1024; // 96 MB

/** Largest sample count analysed. 20M doubles ≈ 160 MB; well past any real record. */
export const MAX_SAMPLES = 20_000_000;

export function assertFileSize(bytes: number): void {
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`Arquivo grande demais (${(bytes / 1e6).toFixed(0)} MB). Limite: ${MAX_FILE_BYTES / 1e6} MB.`);
  }
}

export function assertSampleCount(n: number): void {
  if (n > MAX_SAMPLES) {
    throw new Error(`Sinal com amostras demais (${n.toLocaleString("pt-BR")}). Limite: ${MAX_SAMPLES.toLocaleString("pt-BR")}.`);
  }
  if (n < 16) {
    throw new Error("Sinal curto demais para analise.");
  }
}
