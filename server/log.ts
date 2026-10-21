import { redact } from './redact/index.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

function render(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`; // never a stack
  if (typeof arg === 'string') return arg;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function emit(level: Level, msg: string, extra?: unknown): void {
  const line = redact(extra === undefined ? msg : `${msg} ${render(extra)}`);
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(`${new Date().toISOString()} ${level.toUpperCase()} ${line}`);
}

/** Client-facing message for an unexpected error: redacted, no stack. */
export function safeErrorMessage(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err));
}

export const log = {
  debug: (m: string, e?: unknown) => emit('debug', m, e),
  info: (m: string, e?: unknown) => emit('info', m, e),
  warn: (m: string, e?: unknown) => emit('warn', m, e),
  error: (m: string, e?: unknown) => emit('error', m, e),
};
