import { createHash } from 'node:crypto';

export function fingerprintOf(f: { rule: string; file: string; snippet: string }): string {
  const norm = f.snippet.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`${f.rule}|${f.file}|${norm}`).digest('hex');
}
