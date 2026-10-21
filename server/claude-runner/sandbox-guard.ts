import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['Read', 'Grep', 'Glob']);

function realOrParent(p: string): string {
  let cur = p;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  return path.join(realpathSync(cur), ...tail);
}

function inside(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function toolPathOf(input: unknown): string | null {
  const i = (input ?? {}) as Record<string, unknown>;
  const p = i.file_path ?? i.path;
  return typeof p === 'string' ? p : null;
}

export function checkToolUse(cloneDir: string, tool: string, input: unknown): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED.has(tool)) return { ok: false, reason: `forbidden tool ${tool}` };
  const root = realpathSync(cloneDir);
  const i = (input ?? {}) as Record<string, unknown>;
  const p = toolPathOf(input);
  if (p !== null) {
    if (p.includes('\0')) return { ok: false, reason: 'invalid path' };
    if (!inside(root, realOrParent(path.resolve(root, p)))) return { ok: false, reason: `path outside clone: ${p}` };
  }
  if (tool === 'Glob' && typeof i.pattern === 'string') {
    if (path.isAbsolute(i.pattern) || i.pattern.split(/[\\/]/).includes('..')) {
      return { ok: false, reason: `glob escapes clone: ${i.pattern}` };
    }
  }
  return { ok: true };
}
