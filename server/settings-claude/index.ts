import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/index.js';
import { pingClaude } from '../claude-runner/index.js';
import { spawnLoginPty, type PtyHandle, type PtyExitReason } from '../claude-runner/pty.js';
import { redact, registerSecret } from '../redact/index.js';
import { readSecrets, writeSecrets } from './secrets-store.js';

export interface ClaudeStatus {
  mode: 'cli-login' | 'api-key' | 'none'; cliLoggedIn: boolean; apiKeyHint: string | null;
  lastCheck: { state: 'ok' | 'not_authenticated' | 'error'; message: string; at: string } | null;
}
export interface ConsoleInfo { consoleId: string; expiresAt: string }
export type VerifyResult = 'opérationnel' | 'non authentifié' | string;

export const CONSOLE_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 1000;

export interface SettingsClaude {
  status(): ClaudeStatus;
  setApiKey(key: string): ClaudeStatus;
  deleteApiKey(): ClaudeStatus;
  verify(): Promise<VerifyResult>;
  openConsole(): ConsoleInfo;
  closeConsole(id: string): boolean;
  getConsole(id: string): PtyHandle | null;
}

export class ConsoleInProgressError extends Error {
  constructor() { super('A Claude login console is already open'); }
}
export class InvalidApiKeyError extends Error {
  constructor() { super('Invalid API key'); }
}

export function maskKey(key: string): string { return `sk-ant-…${key.slice(-4)}`; }

export function createSettingsClaude(config: Config, opts: {
  spawnPty?: () => PtyHandle; timeoutMs?: number; onConsoleExit?: (id: string, reason: PtyExitReason) => void;
} = {}): SettingsClaude {
  const spawn = opts.spawnPty ?? spawnLoginPty;
  const timeoutMs = opts.timeoutMs ?? CONSOLE_TIMEOUT_MS;
  const credFile = path.join(config.dataDir, 'claude-home', '.claude', '.credentials.json');
  const envKey = config.anthropicApiKey;
  let storedKey: string | undefined = readSecrets(config.dataDir).anthropicApiKey;
  let lastCheck: ClaudeStatus['lastCheck'] = null;
  let current: { id: string; pty: PtyHandle; expiresAt: string; stop: () => void } | null = null;

  const apply = (): void => {
    config.anthropicApiKey = storedKey ?? envKey;
    if (storedKey) registerSecret(storedKey, 'anthropic-key');
  };
  apply();

  const cliLoggedIn = (): boolean => existsSync(credFile);
  const activeKey = (): string | undefined => config.anthropicApiKey;

  function status(): ClaudeStatus {
    const key = activeKey();
    const cli = cliLoggedIn();
    return { mode: key ? 'api-key' : cli ? 'cli-login' : 'none', cliLoggedIn: cli, apiKeyHint: key ? maskKey(key) : null, lastCheck };
  }

  function setApiKey(key: string): ClaudeStatus {
    const k = key.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{8,}$/.test(k)) throw new InvalidApiKeyError();
    storedKey = k;
    writeSecrets(config.dataDir, { ...readSecrets(config.dataDir), anthropicApiKey: k });
    apply();
    lastCheck = null;
    return status();
  }

  function deleteApiKey(): ClaudeStatus {
    storedKey = undefined;
    const s = readSecrets(config.dataDir);
    delete s.anthropicApiKey;
    writeSecrets(config.dataDir, s);
    apply();
    lastCheck = null;
    return status();
  }

  async function verify(): Promise<VerifyResult> {
    const r = await pingClaude();
    lastCheck = { state: r.state, message: redact(r.message), at: new Date().toISOString() };
    if (r.state === 'ok') return 'opérationnel';
    if (r.state === 'not_authenticated') return 'non authentifié';
    return redact(r.message);
  }

  function openConsole(): ConsoleInfo {
    if (current) throw new ConsoleInProgressError();
    const pty = spawn();
    const id = pty.id;
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();
    let timer: NodeJS.Timeout | undefined, poll: NodeJS.Timeout | undefined;
    const stop = (): void => { clearTimeout(timer); clearInterval(poll); };
    current = { id, pty, expiresAt, stop };
    const finish = (reason: PtyExitReason): void => {
      if (current?.id !== id) return;
      stop();
      current = null;
      opts.onConsoleExit?.(id, reason);
    };
    pty.onExit(finish);
    timer = setTimeout(() => { pty.close(); finish('timeout'); }, timeoutMs);
    poll = setInterval(() => { if (cliLoggedIn()) { pty.close(); finish('logged_in'); } }, POLL_MS);
    return { consoleId: id, expiresAt };
  }

  function closeConsole(id: string): boolean {
    if (current?.id !== id) return false;
    current.pty.close();
    return true;
  }

  return { status, setApiKey, deleteApiKey, verify, openConsole, closeConsole, getConsole: (id) => (current?.id === id ? current.pty : null) };
}
