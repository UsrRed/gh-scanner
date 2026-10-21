import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export function ensureSharedSecret(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, 'secret');
  if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex'), { mode: 0o600 });
  chmodSync(f, 0o600);
  return readFileSync(f, 'utf8').trim();
}
