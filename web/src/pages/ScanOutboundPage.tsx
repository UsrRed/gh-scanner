import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ScanOutbound } from '../../../shared/api';
import { apiGet } from '../api/client';
import { EgressTable, fmtBytes } from '../components/EgressTable';
import { OutboundSummary } from '../components/OutboundSummary';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useApi } from '../hooks/useApi';

type Read = ScanOutbound['reads'][number];

function ReadRow({ scanId, r }: { scanId: string; r: Read }) {
  const [open, setOpen] = useState(false);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && excerpt === null) {
      apiGet<{ excerpt: string }>(`/api/scans/${scanId}/outbound/reads/${r.id}`).then((d) => setExcerpt(d.excerpt), (e: unknown) => setErr(String(e instanceof Error ? e.message : e)));
    }
  };
  return (
    <>
      <tr>
        <td className="mono">{r.tool}</td>
        <td className="mono">{r.path ?? r.pattern ?? '—'}</td>
        <td className="num">{fmtBytes(r.bytes)}</td>
        <td><button type="button" className="btn sm" aria-expanded={open} onClick={toggle}>{open ? 'Masquer' : 'Extrait'}</button></td>
      </tr>
      {open && <tr><td colSpan={4}>{err ? <span role="alert">{err}</span> : excerpt === null ? 'Chargement…' : <pre className="mono" data-testid="excerpt">{excerpt}</pre>}</td></tr>}
    </>
  );
}

export function ScanOutboundPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<ScanOutbound>(`/api/scans/${id}/outbound`);
  let body;
  if (!data && loading) body = <LoadingState label="Chargement des sorties du scan…" />;
  else if (!data && error) body = <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  else if (!data) body = null;
  else body = (
    <>
      <OutboundSummary outbound={data.summary} />
      <div className="panel" style={{ margin: 'var(--s3) 0' }}>
        <div className="lbl">Total vers Anthropic</div>
        <p className="mono" data-testid="anthropic-total">{data.anthropic.connections} conn. · ↑ {fmtBytes(data.anthropic.bytesUp)} · ↓ {fmtBytes(data.anthropic.bytesDown)}</p>
      </div>
      <h3>Fichiers transmis</h3>
      {data.files.length === 0 ? <EmptyState title="Aucun fichier">Claude n'a lu aucun fichier pour ce scan.</EmptyState> : (
        <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
          <table><thead><tr><th>Fichier</th><th className="num">Lectures</th><th className="num">Octets</th></tr></thead>
            <tbody>{data.files.map((f) => <tr key={f.path}><td className="mono">{f.path}</td><td className="num">{f.reads}</td><td className="num">{fmtBytes(f.bytes)}</td></tr>)}</tbody></table>
        </div>
      )}
      <h3>Accès de Claude</h3>
      {data.reads.length === 0 ? <EmptyState title="Aucun accès" /> : (
        <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
          <table><thead><tr><th>Outil</th><th>Cible</th><th className="num">Octets</th><th /></tr></thead>
            <tbody>{data.reads.map((r) => <ReadRow key={r.id} scanId={id} r={r} />)}</tbody></table>
        </div>
      )}
      <h3>Connexions GitHub</h3>
      {data.github.length === 0 ? <EmptyState title="Aucune connexion GitHub" /> : <EgressTable events={data.github} />}
    </>
  );
  return (
    <>
      <PageHeader title="Sorties du scan" sub={id} actions={<Link className="btn sm" to={`/scans/${id}/report`}>Rapport</Link>} />
      {body}
    </>
  );
}
