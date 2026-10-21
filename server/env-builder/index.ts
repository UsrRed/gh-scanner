import path from 'node:path';
import type { Config } from '../config/index.js';
import { registerSecret } from '../redact/index.js';

export type SubprocessKind = 'claude' | 'claude-pty' | 'gh' | 'gh-login' | 'git';
export interface EnvContext { purpose: string; config: Config; apiKey?: string }

export function buildSubprocessEnv(kind: SubprocessKind, ctx: EnvContext): Record<string, string> {
  const c = ctx.config;
  const nodeDir = path.dirname(process.execPath);
  const pathVar = c.subprocessPath.split(':').includes(nodeDir) ? c.subprocessPath : `${c.subprocessPath}:${nodeDir}`;
  const egress = (c.egressUrl ?? `http://127.0.0.1:${c.egressPort}`).replace(/^https?:\/\//, '');
  const proxy = `http://${encodeURIComponent(ctx.purpose)}:x@${egress}`;
  const env: Record<string, string> = {
    PATH: pathVar,
    LANG: 'C.UTF-8',
    HTTPS_PROXY: proxy, HTTP_PROXY: proxy, https_proxy: proxy, http_proxy: proxy,
    DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    GH_TELEMETRY: '0', GH_NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NO_UPDATE_NOTIFIER: '1', DO_NOT_TRACK: '1',
  };
  if (kind === 'claude' || kind === 'claude-pty') {
    env.HOME = path.join(c.dataDir, 'claude-home');
    if (kind === 'claude-pty') env.TERM = 'xterm-256color';
    const key = ctx.apiKey ?? c.anthropicApiKey;
    if (key) { registerSecret(key, 'anthropic-key'); env.ANTHROPIC_API_KEY = key; }
  } else {
    env.HOME = path.join(c.dataDir, 'home');
    env.GH_CONFIG_DIR = path.join(c.dataDir, 'gh');
    if (kind !== 'gh-login') env.GH_PROMPT_DISABLED = '1';
    env.BROWSER = 'true';
    env.GIT_TERMINAL_PROMPT = '0';
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_CONFIG_GLOBAL = path.join(c.dataDir, 'git', 'gitconfig');
    env.GIT_LFS_SKIP_SMUDGE = '1';
  }
  return env;
}

export const buildEnv = buildSubprocessEnv;
