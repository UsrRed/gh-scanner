import type { Severity } from '../../../shared/types';

const LABELS: Record<Severity, string> = { critical: 'critique', high: 'élevée', medium: 'moyenne', low: 'faible', info: 'info' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev ${severity}`}>{LABELS[severity]}</span>;
}
