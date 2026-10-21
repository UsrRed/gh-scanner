import type { RawFinding } from './types.js';

/** Dedup by (file, line, rule|category); local findings win over Claude's. */
export function mergeFindings(claude: RawFinding[], local: RawFinding[]): RawFinding[] {
  const out = [...local];
  for (const c of claude) {
    const dup = out.some((l) => l.file === c.file && l.line === c.line && (l.rule === c.rule || l.category === c.category));
    if (!dup) out.push(c);
  }
  return out;
}
