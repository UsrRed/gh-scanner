import { networkInterfaces } from 'node:os';
import { ALWAYS_KEPT_IP, IPV4_RE, TOKEN_PATTERNS } from './patterns.js';

export interface RedactionContext {
  dataDir: string; workDir: string; hostname: string; username: string; homeDir?: string;
}

let ctx: RedactionContext | null = null;
let hostIps = new Set<string>();
const secrets = new Map<string, string>();

export function initRedaction(c: Partial<RedactionContext> & Pick<RedactionContext, 'dataDir' | 'workDir' | 'hostname' | 'username'>): void {
  ctx = { homeDir: '', ...c };
  hostIps = new Set();
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4') hostIps.add(a.address);
  }
}

export function registerSecret(value: string, label: string): void {
  if (value && value.length >= 8) secrets.set(value, label);
}

export function truncateSecret(s: string): string {
  return s.slice(0, Math.min(4, Math.max(0, s.length - 1))) + '…';
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p);

export function redact(text: string, opts: { repoContent?: boolean } = {}): string {
  if (typeof text !== 'string' || text === '') return text;
  let out = text;
  for (const [value, label] of secrets) out = out.split(value).join(`[REDACTED:${label}]`);
  for (const { type, re } of TOKEN_PATTERNS) out = out.replace(re, `[REDACTED:${type}]`);
  if (ctx) {
    const work = trimSlash(ctx.workDir);
    const data = trimSlash(ctx.dataDir);
    if (work && work !== '/') out = out.replace(new RegExp(`${esc(work)}/[^/\\s'"]+`, 'g'), '<repo>');
    if (data && data !== '/') out = out.replace(new RegExp(esc(data) + '(?![\\w-])', 'g'), '<data>');
    if (ctx.hostname) out = out.replace(new RegExp(`(?<![\\w-])${esc(ctx.hostname)}(?![\\w-])`, 'g'), '<host>');
    if (ctx.username) out = out.replace(new RegExp(`(?<![\\w-])${esc(ctx.username)}(?![\\w-])`, 'g'), '<user>');
  }
  out = out.replace(IPV4_RE, (ip) => {
    if (ALWAYS_KEPT_IP(ip)) return ip;
    if (opts.repoContent && !hostIps.has(ip)) return ip;
    return '<ip>';
  });
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = redactDeep(v);
    return o as T;
  }
  return value;
}
