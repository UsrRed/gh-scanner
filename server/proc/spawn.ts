import { spawn, type ChildProcess } from 'node:child_process';

export interface SpawnTreeOptions { cwd: string; env: Record<string, string>; timeoutMs?: number; signal?: AbortSignal; stdin?: string }
export interface SpawnedTree {
  pid: number; child: ChildProcess;
  done: Promise<{ code: number | null; signal: string | null; timedOut: boolean }>;
}

export function resolveBin(bin: string): { cmd: string; prefixArgs: string[] } {
  return /\.(mjs|js)$/.test(bin) ? { cmd: process.execPath, prefixArgs: [bin] } : { cmd: bin, prefixArgs: [] };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function alive(pid: number): boolean {
  try { process.kill(-pid, 0); return true; } catch { return false; }
}

function signalGroup(pid: number, sig: NodeJS.Signals): void {
  try { process.kill(-pid, sig); } catch { /* group already gone */ }
}

export async function killTree(pid: number, graceMs = 500): Promise<void> {
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (alive(pid) && Date.now() < deadline) await sleep(20);
  if (alive(pid)) signalGroup(pid, 'SIGKILL');
}

export function spawnTree(bin: string, args: string[], o: SpawnTreeOptions): SpawnedTree {
  const { cmd, prefixArgs } = resolveBin(bin);
  const child = spawn(cmd, [...prefixArgs, ...args], {
    cwd: o.cwd, env: o.env, detached: true, shell: false,
    stdio: [o.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });
  const pid = child.pid ?? -1;
  let timedOut = false;
  const done = new Promise<{ code: number | null; signal: string | null; timedOut: boolean }>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const onAbort = (): void => { if (pid > 0) void killTree(pid); };
    if (o.timeoutMs) timer = setTimeout(() => { timedOut = true; if (pid > 0) void killTree(pid); }, o.timeoutMs);
    if (o.signal) {
      if (o.signal.aborted) onAbort(); else o.signal.addEventListener('abort', onAbort, { once: true });
    }
    const finish = (code: number | null, signal: string | null): void => {
      if (timer) clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      resolve({ code, signal, timedOut });
    };
    child.once('error', () => finish(null, null));
    child.once('close', finish);
  });
  if (o.stdin !== undefined && child.stdin) {
    child.stdin.on('error', () => undefined);
    child.stdin.end(o.stdin);
  }
  return { pid, child, done };
}
