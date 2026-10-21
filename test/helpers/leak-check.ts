import os from 'node:os';

export interface LeakContext { dataDir: string; workDir: string; extra?: string[] }

export const SIMULATED_TOKEN = ['ghp_', 'SimulatedLeakCheckToken', '0123456789abcd'].join('');
export const HOST_SECRET_VALUE = 'trap-host-secret-value-7f3a';

/** Forbidden strings that must never appear in DB dumps, logs, WS events or exports. */
export function forbiddenStrings(ctx: LeakContext): string[] {
  const list = [HOST_SECRET_VALUE, os.hostname(), os.userInfo().username, ctx.dataDir, ctx.workDir, SIMULATED_TOKEN, ...(ctx.extra ?? [])];
  return list.filter((s) => s.length >= 4);
}

/** Returns the forbidden strings found in `haystack` (empty = no leak). */
export function findLeaks(haystack: string, ctx: LeakContext): string[] {
  return forbiddenStrings(ctx).filter((s) => haystack.includes(s));
}

export function assertNoLeaks(haystack: string, ctx: LeakContext): void {
  const l = findLeaks(haystack, ctx);
  if (l.length) throw new Error(`leaked strings: ${l.join(', ')}`);
}
