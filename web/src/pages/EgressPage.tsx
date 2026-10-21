import { useState } from 'react';
import type { AlertState } from '../../../shared/api';
import type { EgressEvent, OutboundSummary, Page } from '../../../shared/types';
import { ApiError, apiPost } from '../api/client';
import { BlockedAlertBanner } from '../components/BlockedAlertBanner';
import { EgressTable } from '../components/EgressTable';
import { EgressTotals } from '../components/EgressTotals';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useApi } from '../hooks/useApi';
import { useWsEvent } from '../hooks/useWsEvent';

const PAGE_SIZE = 25;
interface Filters { host: string; purpose: string; scanId: string; status: string; from: string; to: string }
const NONE: Filters = { host: '', purpose: '', scanId: '', status: '', from: '', to: '' };

function query(f: Filters) {
  const qs = new URLSearchParams();
  if (f.host.trim()) qs.set('host', f.host.trim());
  if (f.purpose.trim()) qs.set('purpose', f.purpose.trim());
  if (f.scanId.trim()) qs.set('scanId', f.scanId.trim());
  if (f.status === 'blocked') qs.set('blocked', 'true');
  if (f.status === 'allowed') qs.set('blocked', 'false');
  if (f.from) qs.set('from', new Date(f.from).toISOString());
  if (f.to) qs.set('to', new Date(`${f.to}T23:59:59`).toISOString());
  return qs;
}

function matches(e: EgressEvent, f: Filters): boolean {
  if (f.host.trim() && !e.host.includes(f.host.trim())) return false;
  if (f.purpose.trim() && !e.purpose.includes(f.purpose.trim())) return false;
  if (f.scanId.trim() && e.scanId !== f.scanId.trim()) return false;
  if (f.status === 'blocked' && !e.blocked) return false;
  if (f.status === 'allowed' && e.blocked) return false;
  if (f.from && e.startedAt < new Date(f.from).toISOString()) return false;
  if (f.to && e.startedAt > new Date(`${f.to}T23:59:59`).toISOString()) return false;
  return true;
}

export function EgressPage() {
  const [f, setF] = useState<Filters>(NONE);
  const [page, setPage] = useState(1);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [ackBusy, setAckBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const filterQs = query(f).toString();
  const sep = filterQs ? '&' : '';
  const events = useApi<Page<EgressEvent>>(`/api/egress/events?${filterQs}${sep}page=${page}&pageSize=${PAGE_SIZE}`);
  const totals = useApi<{ destinations: OutboundSummary['destinations'] }>(`/api/egress/totals${filterQs ? `?${filterQs}` : ''}`);
  const alerts = useApi<AlertState>('/api/egress/alerts');

  useWsEvent('egress.event', (ev) => {
    alerts.setData(ev.data.alert);
    const e = ev.data.event;
    if (!matches(e, f)) return;
    totals.reload();
    if (page !== 1) return;
    events.setData(events.data && (events.data.items.some((x) => x.id === e.id) ? events.data
      : { ...events.data, total: events.data.total + 1, items: [e, ...events.data.items].slice(0, PAGE_SIZE) }));
    setFresh((s) => new Set(s).add(e.id));
  });

  const ack = async () => {
    setAckBusy(true); setAckError(null);
    try { alerts.setData(await apiPost<AlertState>('/api/egress/ack')); }
    catch (e) { setAckError(e instanceof ApiError ? e.message : String(e)); }
    finally { setAckBusy(false); }
  };
  const set = (k: keyof Filters) => (v: string) => { setF((o) => ({ ...o, [k]: v })); setPage(1); };

  let body;
  if (!events.data && events.loading) body = <LoadingState label="Chargement du journal…" />;
  else if (!events.data && events.error) body = <ErrorState code={events.error.code} message={events.error.message} onRetry={events.reload} />;
  else if (!events.data || events.data.items.length === 0) body = <EmptyState title="Aucune connexion">Aucune sortie réseau ne correspond à ces critères.</EmptyState>;
  else body = (
    <>
      <EgressTable events={events.data.items} fresh={fresh} />
      <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onPage={setPage} />
    </>
  );
  const txt = (id: string, label: string, k: 'host' | 'purpose' | 'scanId', ph: string) => (
    <div className="field"><label htmlFor={id}>{label}</label><input id={id} value={f[k]} placeholder={ph} onChange={(e) => set(k)(e.target.value)} /></div>
  );
  return (
    <>
      <PageHeader title="Sorties réseau" sub={events.data ? `${events.data.total} connexions` : undefined} />
      <BlockedAlertBanner alert={alerts.data} onAck={ack} busy={ackBusy} />
      {ackError && <ErrorState message={ackError} />}
      <div className="filters">
        {txt('e-host', 'Destination', 'host', 'api.anthropic.com')}
        {txt('e-purpose', 'Finalité', 'purpose', 'scan.')}
        {txt('e-scan', 'Scan', 'scanId', 'id du scan')}
        <div className="field"><label htmlFor="e-status">Statut</label>
          <select id="e-status" value={f.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="">tous</option><option value="blocked">bloquées</option><option value="allowed">autorisées</option>
          </select></div>
        <div className="field"><label htmlFor="e-from">Depuis</label><input id="e-from" type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} /></div>
        <div className="field"><label htmlFor="e-to">Jusqu'au</label><input id="e-to" type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} /></div>
      </div>
      {totals.data && totals.data.destinations.length > 0 && <EgressTotals destinations={totals.data.destinations} />}
      {body}
    </>
  );
}
