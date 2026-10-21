import type { Comparison, Finding, Scan } from '../../shared/types.js';

export function compareFindings(base: Finding[], head: Finding[]): Pick<Comparison, 'added' | 'resolved' | 'persisting'> {
  const baseFp = new Set(base.map((f) => f.fingerprint));
  const headFp = new Set(head.map((f) => f.fingerprint));
  return {
    added: head.filter((f) => !baseFp.has(f.fingerprint)),
    resolved: base.filter((f) => !headFp.has(f.fingerprint)),
    persisting: head.filter((f) => baseFp.has(f.fingerprint)),
  };
}

export function buildComparison(base: Scan, head: Scan, baseFindings: Finding[], headFindings: Finding[]): Comparison {
  if (base.repo !== head.repo) throw new Error('scans belong to different repositories');
  return {
    repo: head.repo, base, head, scoreDelta: (head.score ?? 0) - (base.score ?? 0),
    ...compareFindings(baseFindings, headFindings),
  };
}
