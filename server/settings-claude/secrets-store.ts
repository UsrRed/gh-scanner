import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Secrets { anthropicApiKey?: string }

const file = (dataDir: string): string => path.join(dataDir, 'secrets.json');

export function readSecrets(dataDir: string): Secrets {
  const f = file(dataDir);
  if (!existsSync(f)) return {};
  try {
    const v = JSON.parse(readFileSync(f, 'utf8')) as Secrets;
    return typeof v === 'object' && v ? v : {};
  } catch { return {}; }
}

/** Atomic write with mode 600 (umask 077 for the duration of the write). */
export function writeSecrets(dataDir: string, s: Secrets): void {
  const f = file(dataDir);
  const tmp = `${f}.tmp`;
  const old = process.umask(0o077);
  try {
    writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, f);
  } finally { process.umask(old); }
}
