import { Link, useSearchParams } from 'react-router-dom';
import type { Comparison, Finding } from '../../../shared/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { PageHeader } from '../components/PageHeader';
import { SeverityBadge } from '../components/SeverityBadge';
import { useApi } from '../hooks/useApi';

function Column({ title, items, cls, id }: { title: string; items: Finding[]; cls?: string; id: string }) {
  return (
    <div className={`cmp-col${cls ? ` ${cls}` : ''}`} data-col={id}>
      <h3>{title}<b>{items.length}</b></h3>
      {items.map((f) => <div className="item" key={f.id}><SeverityBadge severity={f.severity} /><span className="ttl">{f.title}</span></div>)}
    </div>
  );
}

export function ComparePage() {
  const [sp] = useSearchParams();
  const base = sp.get('base'); const head = sp.get('head');
  const { data, error, loading, reload } = useApi<Comparison>(base && head ? `/api/compare?base=${base}&head=${head}` : null);

  if (!base || !head) return <EmptyState title="Aucune comparaison">Sélectionnez deux scans dans l'<Link to="/history">historique</Link>.</EmptyState>;
  if (!data && loading) return <LoadingState label="Chargement de la comparaison…" />;
  if (!data && error) return <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  if (!data) return <EmptyState title="Comparaison indisponible" />;

  const d = data.scoreDelta;
  const color = (s: number | null) => (s == null ? undefined : s >= 80 ? 'var(--ok)' : s >= 50 ? 'var(--med)' : 'var(--crit)');
  return (
    <>
      <PageHeader title={`Comparaison · ${data.repo}`} sub={`${data.base.id.slice(0, 8)} → ${data.head.id.slice(0, 8)}`}
        actions={<Link className="btn sm" to="/history">Historique</Link>} />
      <div className="panel">
        <div className="delta" style={{ marginBottom: 'var(--s4)' }}>
          <span className="score" style={{ color: color(data.base.score) }}>{data.base.score ?? '—'}</span><span className="arrow">→</span>
          <span className="score" style={{ color: color(data.head.score) }}>{data.head.score ?? '—'}</span>
          <span className="up" data-testid="delta" style={d < 0 ? { color: 'var(--crit)' } : undefined}>{d > 0 ? `+${d}` : String(d)}</span>
        </div>
        <div className="cmp-cols">
          <Column id="added" title="Nouveaux" items={data.added} />
          <Column id="resolved" title="Résolus" items={data.resolved} cls="resolved" />
          <Column id="persisting" title="Persistants" items={data.persisting} />
        </div>
      </div>
    </>
  );
}
