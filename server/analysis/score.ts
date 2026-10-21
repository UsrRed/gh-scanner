import type { Finding } from '../../shared/types.js';

const PENALTY = { critical: 40, high: 15, medium: 5, low: 1, info: 0 } as const;

export function computeScore(fs: Pick<Finding, 'severity'>[]): number {
  return Math.max(0, 100 - fs.reduce((s, f) => s + PENALTY[f.severity], 0));
}
