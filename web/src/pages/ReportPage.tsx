import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Report, Severity } from '../../../shared/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { PageHeader } from '../components/PageHeader';
import { VerdictStamp } from '../components/VerdictStamp';
import { ScoreBlock } from '../components/ScoreBlock';
import { SeverityCounters } from '../components/SeverityCounters';
import { FiltersBar } from '../components/FiltersBar';
import { FindingItem } from '../components/FindingItem';
import { Pagination } from '../components/Pagination';
import { UsageTable } from '../components/UsageTable';
import { OutboundSummary } from '../components/OutboundSummary';
import { VERDICT_LABEL } from '../components/VerdictStamp';
import { useApi } from '../hooks/useApi';

const PAGE_SIZE = 10;

export function ReportPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<Report>(`/api/scans/${id}/report`);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [severity, category]);

  const filtered = useMemo(
    () => (data?.findings ?? []).filter((f) => (!severity || f.severity === severity) && (!category || f.category === category)),
    [data, severity, category],
  );
  const categories = useMemo(() => [...new Set((data?.findings ?? []).map((f) => f.category))].sort(), [data]);

  if (!data && loading) return <LoadingState label="Chargement du rapport…" />;
  if (!data && error) return <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  if (!data) return <EmptyState title="Rapport indisponible" />;

  const { scan } = data;
  const dl = (fmt: string) => `/api/scans/${scan.id}/export?format=${fmt}`;
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <>
      <PageHeader
        title={scan.repo}
        sub={`${scan.ref ?? 'défaut'} · ${scan.commitSha?.slice(0, 7) ?? '—'} · scan ${scan.id.slice(0, 8)} · ${scan.status}`}
        actions={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link className="btn sm" to="/history">Historique</Link>
          {scan.previousScanId && <Link className="btn sm" to={`/compare?base=${scan.previousScanId}&head=${scan.id}`}>Comparer au précédent</Link>}
          <a className="btn sm" href={dl('md')} download>Export .md</a>
          <a className="btn sm" href={dl('json')} download>Export .json</a>
        </div>}
      />
      {data.partial && <div className="err-box" role="status">Rapport partiel : le scan ne s'est pas terminé normalement ({scan.status}).</div>}
      <div className="verdict">
        <VerdictStamp verdict={data.claudeVerdict} caption={`inspecté · ${scan.id.slice(0, 6)}`} />
        <ScoreBlock score={data.score} formula={data.scoreFormula} justification={data.justification}
          verdictLabel={data.claudeVerdict ? VERDICT_LABEL[data.claudeVerdict] : undefined} />
        <div />
      </div>
      <SeverityCounters counts={data.counts} />
      <div className="grid-main">
        <div>
          <FiltersBar severity={severity} category={category} categories={categories} total={data.findings.length}
            onSeverity={setSeverity} onCategory={setCategory} />
          {visible.length === 0
            ? <EmptyState title="Aucun finding">{data.findings.length ? 'Aucun résultat pour ces filtres.' : 'Aucun problème détecté.'}</EmptyState>
            : visible.map((f) => <FindingItem key={f.id} f={f} />)}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
        <aside>
          <UsageTable passes={data.passes} total={scan.usage} />
          <div style={{ marginTop: 'var(--s4)' }}><OutboundSummary outbound={data.outbound} /><Link className="btn sm" to={`/scans/${scan.id}/outbound`}>Détail des sorties</Link></div>
        </aside>
      </div>
    </>
  );
}
