import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Page, Scan, ScanStatus } from '../../../shared/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { MiniStamp } from '../components/VerdictStamp';
import { useApi } from '../hooks/useApi';

const PAGE_SIZE = 20;
const STATUSES: ScanStatus[] = ['queued', 'cloning', 'mapping', 'analyzing', 'synthesizing', 'done', 'failed', 'cancelled', 'budget_exceeded'];

export function HistoryPage() {
  const nav = useNavigate();
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (repo.trim()) qs.set('repo', repo.trim());
  if (status) qs.set('status', status);
  if (from) qs.set('from', new Date(from).toISOString());
  if (to) qs.set('to', new Date(`${to}T23:59:59`).toISOString());
  const { data, error, loading, reload } = useApi<Page<Scan>>(`/api/scans?${qs}`);

  const filter = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1]!, id] : [...s, id]));
  const compare = () => {
    const picked = (data?.items ?? []).filter((s) => sel.includes(s.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const all = picked.length === 2 ? picked : sel.map((id) => ({ id }));
    nav(`/compare?base=${all[0]!.id}&head=${all[1]!.id}`);
  };

  let body;
  if (!data && loading) body = <LoadingState label="Chargement de l'historique…" />;
  else if (!data && error) body = <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  else if (!data || data.items.length === 0) body = <EmptyState title="Aucun scan">Aucun scan ne correspond à ces critères.</EmptyState>;
  else {
    body = (
      <>
        <div className="panel" style={{ padding: 0, overflow: 'auto', marginBottom: 'var(--s3)' }}>
          <table>
            <thead><tr><th style={{ width: 28 }} /><th>Dépôt · ref</th><th>Statut</th><th>Verdict</th><th className="num">Score</th><th className="num hide-m">Coût</th><th className="hide-m">Date</th></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" aria-label={`sélection ${s.repo}`} checked={sel.includes(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td className="mono"><Link to={`/scans/${s.id}/report`}>{s.repo}</Link> · {s.ref ?? 'défaut'}</td>
                  <td className="mono">{s.status}</td>
                  <td><MiniStamp verdict={s.claudeVerdict} /></td>
                  <td className="num">{s.score ?? '—'}</td>
                  <td className="num hide-m">{s.usage.costUsd.toFixed(2).replace('.', ',')} $</td>
                  <td className="mono hide-m">{s.createdAt.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Historique" sub={data ? `${data.total} scans` : undefined}
        actions={<button type="button" className="btn sm primary" disabled={sel.length !== 2} onClick={compare}>Comparer ({sel.length}/2)</button>} />
      <div className="filters">
        <div className="field"><label htmlFor="h-repo">Dépôt</label><input id="h-repo" value={repo} onChange={(e) => filter(setRepo)(e.target.value)} placeholder="owner/name" /></div>
        <div className="field"><label htmlFor="h-status">Statut</label>
          <select id="h-status" value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
            <option value="">tous</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div className="field"><label htmlFor="h-from">Depuis</label><input id="h-from" type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)} /></div>
        <div className="field"><label htmlFor="h-to">Jusqu'au</label><input id="h-to" type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)} /></div>
      </div>
      {body}
    </>
  );
}
