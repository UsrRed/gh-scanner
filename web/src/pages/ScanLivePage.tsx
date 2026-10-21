import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ACTIVE_STATUSES, type Scan, type Usage } from '../../../shared/types';
import { ApiError, apiGet, apiPost } from '../api/client';
import { BudgetGauges } from '../components/BudgetGauges';
import { LogTerminal, type LogLine } from '../components/LogTerminal';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/StateViews';
import { StepTrack } from '../components/StepTrack';
import { useApi } from '../hooks/useApi';
import { useWsEvent } from '../hooks/useWsEvent';
import { useWsState } from '../ws/WsProvider';

const FINAL = ['done', 'failed', 'cancelled', 'budget_exceeded'];
const BUDGET_DEFAULT = { usd: 2, tokens: 1_500_000 };

export function ScanLivePage() {
  const { id = '' } = useParams();
  const scanApi = useApi<Scan>(`/api/scans/${id}`);
  const { data: scan, setData: setScan } = scanApi;
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [total, setTotal] = useState<Usage | null>(null);
  const [budget, setBudget] = useState(BUDGET_DEFAULT);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const ws = useWsState();

  useEffect(() => {
    let off = false;
    apiGet<{ items: LogLine[] }>(`/api/scans/${id}/logs`).then(
      (r) => { if (!off) setLogs((cur) => merge(r.items, cur)); },
      () => {},
    );
    return () => { off = true; };
  }, [id]);

  useWsEvent('scan.status', (ev) => { if (ev.data.scan.id === id) setScan(ev.data.scan); });
  useWsEvent('scan.step', (ev) => {
    if (ev.data.scanId !== id) return;
    setDetail(ev.data.detail ?? ev.data.label);
    setScan(scan ? { ...scan, status: ev.data.status } : scan);
  });
  useWsEvent('scan.log', (ev) => {
    if (ev.data.scanId !== id) return;
    const { seq, level, message } = ev.data;
    setLogs((cur) => merge(cur, [{ seq, level, message, ts: ev.ts }]));
  });
  useWsEvent('scan.usage', (ev) => {
    if (ev.data.scanId !== id) return;
    setTotal(ev.data.total);
    setBudget(ev.data.budget);
  });

  if (!scan && scanApi.loading) return <LoadingState label="Chargement du scan…" />;
  if (!scan) return <ErrorState code={scanApi.error?.code} message={scanApi.error?.message ?? 'Scan introuvable'} onRetry={scanApi.reload} />;

  const cancellable = scan.status === 'queued' || ACTIVE_STATUSES.includes(scan.status);
  const cancel = async () => {
    setActionErr(null);
    try {
      setScan(await apiPost<Scan>(`/api/scans/${id}/cancel`));
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <>
      <PageHeader title={scan.repo} sub={`${scan.ref ?? 'HEAD'} · ${scan.id}`}
        actions={cancellable && <button type="button" className="btn danger" onClick={cancel}>Annuler</button>} />
      {actionErr && <div className="err-box" role="alert">{actionErr}</div>}
      <div className="scan-card">
        <div className="head">
          <b>{scan.status.toUpperCase()}</b>
          <span>{scan.status === 'queued' && scan.queuePosition != null ? `position ${scan.queuePosition} dans la file` : detail ?? ''}</span>
        </div>
        <div className="body">
          <StepTrack status={scan.status} detail={detail} />
          <BudgetGauges usage={total ?? scan.usage} budget={budget} />
          {scan.failure && <div className="err-box" role="alert"><code>{scan.failure.code}</code>{scan.failure.message}</div>}
          <LogTerminal lines={logs} live={ws === 'live' && !FINAL.includes(scan.status)} />
          {scan.status === 'done' && <p><Link to={`/scans/${scan.id}/report`}>Voir le rapport →</Link></p>}
        </div>
      </div>
    </>
  );
}

function merge(a: LogLine[], b: LogLine[]): LogLine[] {
  const bySeq = new Map<number, LogLine>();
  for (const l of [...a, ...b]) bySeq.set(l.seq, l);
  return [...bySeq.values()].sort((x, y) => x.seq - y.seq);
}
