import path from 'node:path';
import { z } from 'zod';
import { envSchema, type AllowEntry } from './schema.js';
import { appRoot } from '../paths.js';

export type { AllowEntry } from './schema.js';
export { parseAllowlist } from './schema.js';

export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfigError'; }
}

export interface Config {
  host: string; port: number; dataDir: string; workDir: string;
  adminPassword: string | undefined; cookieSecure: boolean; containerLocal: boolean;
  concurrency: number; maxRepoMb: number; cloneTimeoutS: number; sessionTimeoutS: number;
  budgetUsd: number; budgetTokens: number; maxTurns: number;
  modelAnalysis: string; modelSynthesis: string; modelPing: string;
  keepClones: boolean; claudeBin: string; ghBin: string; gitBin: string;
  egressUrl: string | undefined;
  egressPort: number; egressHost: string; egressAllowlist: AllowEntry[];
  egressSharedDir: string; egressAppUrl: string; egressIngressPort: number | undefined;
  egressIngressTarget: string | undefined; egressHostOverrides: Record<string, string>;
  subprocessPath: string; anthropicApiKey: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const r = envSchema.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid configuration: ${msg}`);
  }
  const e = r.data;
  // Default: <app>/data, writable for a non-root PC install (Docker sets /data explicitly).
  const dataDir = path.resolve(e.SCANNER_DATA_DIR ?? path.join(appRoot(), 'data'));
  return {
    host: e.SCANNER_HOST, port: e.SCANNER_PORT, dataDir,
    workDir: e.SCANNER_WORK_DIR ?? path.join(dataDir, 'work'),
    adminPassword: e.SCANNER_ADMIN_PASSWORD, cookieSecure: e.SCANNER_COOKIE_SECURE,
    containerLocal: e.SCANNER_CONTAINER_LOCAL,
    concurrency: e.SCANNER_CONCURRENCY, maxRepoMb: e.SCANNER_MAX_REPO_MB,
    cloneTimeoutS: e.SCANNER_CLONE_TIMEOUT_S, sessionTimeoutS: e.SCANNER_SESSION_TIMEOUT_S,
    budgetUsd: e.SCANNER_BUDGET_USD, budgetTokens: e.SCANNER_BUDGET_TOKENS, maxTurns: e.SCANNER_MAX_TURNS,
    modelAnalysis: e.SCANNER_MODEL_ANALYSIS, modelSynthesis: e.SCANNER_MODEL_SYNTHESIS,
    modelPing: e.SCANNER_MODEL_PING, keepClones: e.SCANNER_KEEP_CLONES,
    claudeBin: e.SCANNER_CLAUDE_BIN, ghBin: e.SCANNER_GH_BIN, gitBin: e.SCANNER_GIT_BIN,
    egressUrl: e.SCANNER_EGRESS_URL, egressPort: e.EGRESS_PORT,
    egressHost: e.EGRESS_HOST ?? '127.0.0.1', egressAllowlist: e.EGRESS_ALLOWLIST,
    egressSharedDir: e.EGRESS_SHARED_DIR ?? path.join(dataDir, 'egress'),
    egressAppUrl: e.EGRESS_APP_URL, egressIngressPort: e.EGRESS_INGRESS_PORT,
    egressIngressTarget: e.EGRESS_INGRESS_TARGET ?? (e.EGRESS_INGRESS_PORT ? 'app:8417' : undefined),
    egressHostOverrides: e.EGRESS_HOST_OVERRIDES,
    subprocessPath: e.SCANNER_SUBPROCESS_PATH, anthropicApiKey: e.ANTHROPIC_API_KEY,
  };
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export function authRequired(c: Config): boolean {
  return !LOOPBACK.has(c.host) || c.adminPassword !== undefined;
}

export function assertStartupAllowed(c: Config): void {
  if (!LOOPBACK.has(c.host) && !c.adminPassword && !c.containerLocal) {
    throw new ConfigError(
      `SCANNER_HOST=${c.host} is not loopback: set SCANNER_ADMIN_PASSWORD (or SCANNER_CONTAINER_LOCAL=1 for compose-only use).`);
  }
}
