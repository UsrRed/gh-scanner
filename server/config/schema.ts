import { z } from 'zod';

export interface AllowEntry { host: string; port: number }

export const DEFAULT_ALLOWLIST =
  'github.com,api.github.com,codeload.github.com,objects.githubusercontent.com,raw.githubusercontent.com,'
  + 'api.anthropic.com,console.anthropic.com,claude.ai,platform.claude.com';
// statsig.anthropic.com is deliberately absent: telemetry stays blocked and visible as an alert (SPEC F8).

export function parseAllowlist(csv: string): AllowEntry[] {
  return csv.split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const m = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(item);
    if (!m) throw new Error(`invalid allowlist entry: ${item}`);
    const port = m[2] ? Number(m[2]) : 443;
    if (port < 1 || port > 65535) throw new Error(`invalid allowlist port: ${item}`);
    return { host: m[1]!.toLowerCase(), port };
  });
}

const bool = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return v;
}, z.boolean());
const int = (def: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(min).max(max).default(def));
const num = (def: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().positive().default(def));
const opt = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const str = (def: string) => z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).default(def));

const hostOverrides = z.preprocess((v) => (v === undefined ? '' : v), z.string()).transform((s, ctx) => {
  const out: Record<string, string> = {};
  for (const item of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const i = item.indexOf('=');
    if (i <= 0 || i === item.length - 1) {
      ctx.addIssue({ code: 'custom', message: `invalid override: ${item}` });
      return z.NEVER;
    }
    out[item.slice(0, i)] = item.slice(i + 1);
  }
  return out;
});

const allowlist = z.preprocess((v) => (v === undefined || v === '' ? DEFAULT_ALLOWLIST : v), z.string())
  .transform((s, ctx) => {
    try { return parseAllowlist(s); } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  });

export const envSchema = z.object({
  SCANNER_HOST: str('127.0.0.1'),
  SCANNER_PORT: int(8417, 0, 65535),
  SCANNER_DATA_DIR: str('/data'),
  SCANNER_WORK_DIR: opt,
  SCANNER_ADMIN_PASSWORD: opt,
  SCANNER_COOKIE_SECURE: bool.default(false),
  SCANNER_CONTAINER_LOCAL: bool.default(false),
  SCANNER_CONCURRENCY: int(1, 1, 16),
  SCANNER_MAX_REPO_MB: int(200, 1),
  SCANNER_CLONE_TIMEOUT_S: int(120, 1),
  SCANNER_SESSION_TIMEOUT_S: int(900, 1),
  SCANNER_BUDGET_USD: num(2),
  SCANNER_BUDGET_TOKENS: int(1500000, 1),
  SCANNER_MAX_TURNS: int(60, 1),
  SCANNER_MODEL_ANALYSIS: str('claude-sonnet-5-5'),
  SCANNER_MODEL_SYNTHESIS: str('claude-opus-5-5'),
  SCANNER_MODEL_PING: str('claude-haiku-5-5'),
  SCANNER_KEEP_CLONES: bool.default(false),
  SCANNER_CLAUDE_BIN: str('claude'),
  SCANNER_GH_BIN: str('gh'),
  SCANNER_GIT_BIN: str('git'),
  SCANNER_SUBPROCESS_PATH: str('/usr/local/bin:/usr/bin:/bin'),
  SCANNER_EGRESS_URL: opt,
  EGRESS_PORT: int(3128, 0, 65535),
  EGRESS_HOST: opt,
  EGRESS_ALLOWLIST: allowlist,
  EGRESS_SHARED_DIR: opt,
  EGRESS_APP_URL: str('http://app:8417'),
  EGRESS_INGRESS_PORT: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)),
    z.number().int().min(1).max(65535).optional()),
  EGRESS_INGRESS_TARGET: opt,
  EGRESS_HOST_OVERRIDES: hostOverrides,
  ANTHROPIC_API_KEY: opt,
});
