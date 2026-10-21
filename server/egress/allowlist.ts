import type { AllowEntry } from '../config/schema.js';
export { parseAllowlist } from '../config/schema.js';
export type { AllowEntry };

export function isAllowed(allowlist: AllowEntry[], host: string, port: number): boolean {
  const h = host.toLowerCase();
  return allowlist.some((e) => e.host === h && e.port === port);
}

/** Test overrides: "host:port" -> "ip:port" (connection target actually dialled). */
export function resolveTarget(overrides: Record<string, string>, host: string, port: number): { host: string; port: number } {
  const o = overrides[`${host.toLowerCase()}:${port}`];
  if (!o) return { host, port };
  const i = o.lastIndexOf(':');
  return { host: o.slice(0, i), port: Number(o.slice(i + 1)) };
}
