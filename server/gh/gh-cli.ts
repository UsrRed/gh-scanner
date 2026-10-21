import type { Config } from '../config/index.js';
import { buildSubprocessEnv } from '../env-builder/index.js';
import { spawnTree } from '../proc/spawn.js';
import { redact } from '../redact/index.js';

export interface RunGhOptions {
  purpose: string; config: Config; kind?: 'gh' | 'gh-login'; timeoutMs?: number; signal?: AbortSignal; cwd?: string;
}

/** Sole launcher of `gh`. Output is redacted. */
export async function runGh(args: string[], o: RunGhOptions): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = buildSubprocessEnv(o.kind ?? 'gh', { purpose: o.purpose, config: o.config });
  const t = spawnTree(o.config.ghBin, args, {
    cwd: o.cwd ?? o.config.dataDir, env, timeoutMs: o.timeoutMs, signal: o.signal,
  });
  let stdout = '', stderr = '';
  t.child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
  t.child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
  const r = await t.done;
  return { code: r.code ?? -1, stdout: redact(stdout), stderr: redact(stderr + (r.timedOut ? '\ntimeout' : '')) };
}
