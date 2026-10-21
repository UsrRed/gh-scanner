import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSubprocessEnv } from '../env-builder/index.js';
import { resolveBin } from '../proc/spawn.js';
import { redact } from '../redact/index.js';
import { getConfig } from './config.js';

export type PtyExitReason = 'logged_in' | 'timeout' | 'exited' | 'closed';
export interface PtyHandle {
  id: string; onData(cb: (d: string) => void): void; write(d: string): void;
  resize(c: number, r: number): void; onExit(cb: (reason: PtyExitReason) => void): void; close(): void;
}

const require = createRequire(import.meta.url);
const LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Interactive `claude` in a PTY (HOME = <data>/claude-home) for the login console. Output is redacted. */
export function spawnLoginPty(): PtyHandle {
  // lazy: the native module is only needed for the login console
  const nodePty = require('node-pty') as typeof import('node-pty');
  const config = getConfig();
  const home = path.join(config.dataDir, 'claude-home');
  mkdirSync(home, { recursive: true });
  const env = buildSubprocessEnv('claude-pty', { purpose: 'settings.claude-login', config });
  const { cmd, prefixArgs } = resolveBin(config.claudeBin);
  const term = nodePty.spawn(cmd, prefixArgs, { name: 'xterm-256color', cols: 100, rows: 30, cwd: home, env });
  const dataCbs: ((d: string) => void)[] = [];
  const exitCbs: ((r: PtyExitReason) => void)[] = [];
  let loggedIn = false, reason: PtyExitReason | null = null, finished = false;
  term.onData((d) => {
    if (/login successful|logged in as|successfully logged in/i.test(d)) loggedIn = true;
    const safe = redact(d);
    for (const cb of dataCbs) cb(safe);
  });
  term.onExit(() => {
    finished = true;
    clearTimeout(timer);
    const r = reason ?? (loggedIn ? 'logged_in' : 'exited');
    for (const cb of exitCbs) cb(r);
  });
  const timer = setTimeout(() => { reason = 'timeout'; try { term.kill(); } catch { /* gone */ } }, LOGIN_TIMEOUT_MS);
  return {
    id: randomUUID(),
    onData: (cb) => { dataCbs.push(cb); },
    write: (d) => { if (!finished) term.write(d); },
    resize: (c, r) => { if (!finished) try { term.resize(Math.max(1, c), Math.max(1, r)); } catch { /* ignore */ } },
    onExit: (cb) => { exitCbs.push(cb); },
    close: () => { if (!finished) { reason = 'closed'; try { term.kill(); } catch { /* gone */ } } },
  };
}
