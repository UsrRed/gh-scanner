import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function tmpDirs() {
  const dirs: string[] = [];
  return {
    make(prefix = 'gh-scanner-'): string { const d = mkdtempSync(path.join(tmpdir(), prefix)); dirs.push(d); return d; },
    cleanup(): void { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); },
  };
}
