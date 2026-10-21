import type { Severity } from '../../../shared/types';
import { SEVERITIES } from './SeverityCounters';

const LABEL: Record<Severity, string> = { critical: 'critique', high: 'élevée', medium: 'moyenne', low: 'faible', info: 'info' };

export function FiltersBar({ severity, category, categories, total, onSeverity, onCategory }: {
  severity: Severity | null; category: string | null; categories: string[]; total: number;
  onSeverity: (s: Severity | null) => void; onCategory: (c: string | null) => void;
}) {
  return (
    <div className="filters" role="group" aria-label="Filtres">
      <button type="button" className={`chip${severity === null ? ' on' : ''}`} aria-pressed={severity === null} onClick={() => onSeverity(null)}>Toutes · {total}</button>
      {SEVERITIES.map((s) => (
        <button key={s} type="button" className={`chip${severity === s ? ' on' : ''}`} aria-pressed={severity === s} onClick={() => onSeverity(s)}>{LABEL[s]}</button>
      ))}
      <span className="sep" />
      <select aria-label="Catégorie" value={category ?? ''} onChange={(e) => onCategory(e.target.value || null)}>
        <option value="">catégorie : toutes</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
