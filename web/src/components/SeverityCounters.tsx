import type { Severity } from '../../../shared/types';

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const LABEL: Record<Severity, string> = { critical: 'critique', high: 'élevée', medium: 'moyenne', low: 'faible', info: 'info' };
const CLS: Record<Severity, string> = { critical: 'c-crit', high: 'c-high', medium: 'c-med', low: 'c-low', info: 'c-info' };

export function SeverityCounters({ counts }: { counts: Record<Severity, number> }) {
  return (
    <div className="counters">
      {SEVERITIES.map((s) => <div key={s} className={CLS[s]} data-sev={s}><b>{counts[s] ?? 0}</b>{LABEL[s]}</div>)}
    </div>
  );
}
