import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Config } from '../config/index.js';
import { buildSubprocessEnv } from '../env-builder/index.js';
import { killTree, spawnTree } from '../proc/spawn.js';
import { runGh } from '../gh/gh-cli.js';
import { redact } from '../redact/index.js';
import { log } from '../log.js';
import { parseDeviceOutput } from './device-parse.js';

export { parseDeviceOutput } from './device-parse.js';

export type GhFlowState = 'starting' | 'pending' | 'connected' | 'expired' | 'cancelled' | 'error';
export interface GhFlow { id: string; state: GhFlowState; userCode: string | null; verificationUrl: string | null; expiresAt: string; message: string | null }
export interface GhStatus { connected: boolean; login: string | null; scopes: string[]; error: string | null }

export const FLOW_TIMEOUT_MS = 15 * 60 * 1000;
const PURPOSE = 'settings.gh-login';

export class FlowInProgressError extends Error {
  constructor() { super('A GitHub login is already in progress'); }
}

export interface SettingsGh {
  startLogin(): GhFlow;
  getFlow(id?: string): GhFlow | null;
  cancelFlow(id?: string): Promise<GhFlow | null>;
  status(): Promise<GhStatus>;
  logout(): Promise<GhStatus>;
  verifyStoragePermissions(): string[];
}

export function createSettingsGh(config: Config, opts: { onChange?: (f: GhFlow) => void; timeoutMs?: number } = {}): SettingsGh {
  const timeoutMs = opts.timeoutMs ?? FLOW_TIMEOUT_MS;
  let flow: GhFlow | null = null;
  let pid: number | null = null;
  let timer: NodeJS.Timeout | null = null;

  const update = (patch: Partial<GhFlow>): void => {
    if (!flow) return;
    flow = { ...flow, ...patch };
    opts.onChange?.(flow);
  };
  const terminal = (s: GhFlowState): boolean => s !== 'starting' && s !== 'pending';
  const stopTimer = (): void => { if (timer) clearTimeout(timer); timer = null; };

  function startLogin(): GhFlow {
    if (flow && !terminal(flow.state)) throw new FlowInProgressError();
    verifyStoragePermissions();
    const id = randomUUID();
    flow = { id, state: 'starting', userCode: null, verificationUrl: null, expiresAt: new Date(Date.now() + timeoutMs).toISOString(), message: null };
    const env = buildSubprocessEnv('gh-login', { purpose: PURPOSE, config });
    const t = spawnTree(config.ghBin, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], {
      cwd: config.dataDir, env, stdin: '',
    });
    pid = t.pid;
    let out = '';
    const onData = (d: Buffer): void => {
      if (flow?.id !== id) return;
      out += d.toString('utf8');
      const p = parseDeviceOutput(out);
      if (flow.state === 'starting' && p.userCode) update({ state: 'pending', userCode: p.userCode, verificationUrl: p.url ?? 'https://github.com/login/device' });
    };
    t.child.stdout?.on('data', onData);
    t.child.stderr?.on('data', onData);
    timer = setTimeout(() => {
      if (flow?.id !== id || terminal(flow.state)) return;
      update({ state: 'expired', message: 'Login expired after 15 minutes' });
      void killTree(t.pid);
    }, timeoutMs);
    void t.done.then((r) => {
      stopTimer();
      pid = null;
      if (flow?.id !== id || terminal(flow.state)) return;
      if (r.code === 0) update({ state: 'connected', message: null });
      else update({ state: 'error', message: redact(out.trim().split('\n').slice(-1)[0] ?? 'gh auth login failed') });
      verifyStoragePermissions();
    });
    return flow;
  }

  const getFlow = (id?: string): GhFlow | null => (flow && (!id || flow.id === id) ? flow : null);

  async function cancelFlow(id?: string): Promise<GhFlow | null> {
    const f = getFlow(id);
    if (!f) return null;
    if (!terminal(f.state)) {
      update({ state: 'cancelled', message: null });
      stopTimer();
      if (pid) await killTree(pid);
    }
    return flow;
  }

  async function status(): Promise<GhStatus> {
    const st = await runGh(['auth', 'status', '--hostname', 'github.com'], { purpose: 'settings.gh-status', config, timeoutMs: 15000 });
    if (st.code !== 0) return { connected: false, login: null, scopes: [], error: null };
    const text = `${st.stdout}\n${st.stderr}`;
    const scopeLine = /Token scopes:\s*(.+)/i.exec(text)?.[1] ?? '';
    const scopes = [...scopeLine.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const api = await runGh(['api', 'user'], { purpose: 'settings.gh-status', config, timeoutMs: 15000 });
    let login: string | null = null;
    let error: string | null = null;
    if (api.code === 0) {
      try { const l = (JSON.parse(api.stdout) as { login?: unknown }).login; login = typeof l === 'string' ? l : null; } catch { error = 'invalid_response'; }
    } else error = redact(api.stderr.trim().split('\n')[0] ?? 'gh api failed');
    return { connected: true, login, scopes, error };
  }

  async function logout(): Promise<GhStatus> {
    await runGh(['auth', 'logout', '--hostname', 'github.com'], { purpose: 'settings.gh-logout', config, timeoutMs: 15000 });
    return status();
  }

  function verifyStoragePermissions(): string[] {
    const fixed: string[] = [];
    const fix = (p: string, mode: number, isDir: boolean): void => {
      let st;
      try { st = statSync(p); } catch { return; }
      if ((st.mode & 0o777) !== mode) {
        chmodSync(p, mode);
        fixed.push(p);
        log.warn(`fixed permissions of ${path.relative(config.dataDir, p) || '.'} to ${mode.toString(8)}`);
      }
      if (isDir) for (const e of readdirSync(p, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        fix(path.join(p, e.name), e.isDirectory() ? 0o700 : 0o600, e.isDirectory());
      }
    };
    const dir = path.join(config.dataDir, 'gh');
    if (existsSync(dir)) fix(dir, 0o700, true);
    return fixed;
  }

  return { startLogin, getFlow, cancelFlow, status, logout, verifyStoragePermissions };
}
