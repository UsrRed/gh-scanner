import { useState } from 'react';
import type { Scan } from '../../../shared/types';
import { ApiError, apiPost } from '../api/client';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { PageHeader } from '../components/PageHeader';
import { QueueRow } from '../components/QueueRow';
import { useApi } from '../hooks/useApi';
import { useWsEvent } from '../hooks/useWsEvent';

interface QueueData { running: Scan[]; queued: Scan[] }

export function QueuePage() {
  const { data, error, loading, reload } = useApi<QueueData>('/api/queue');
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useWsEvent('scan.status', () => reload());

  const cancel = async (id: string) => {
    setBusyId(id);
    setCancelErr(null);
    try {
      await apiPost<Scan>(`/api/scans/${id}/cancel`);
      reload();
    } catch (e) {
      setCancelErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (!data && loading) body = <LoadingState label="Chargement de la file…" />;
  else if (!data && error) body = <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  else if (!data || data.running.length + data.queued.length === 0) {
    body = <EmptyState title="File vide">Aucun scan en cours ni en attente.</EmptyState>;
  } else {
    body = (
      <div className="scan-card"><div className="body">
        {[...data.running, ...data.queued].map((s) => <QueueRow key={s.id} scan={s} onCancel={cancel} busy={busyId === s.id} />)}
      </div></div>
    );
  }
  return (
    <>
      <PageHeader title="File" sub="Scans en cours et en attente" />
      {cancelErr && <div className="err-box" role="alert">{cancelErr}</div>}
      {body}
    </>
  );
}
