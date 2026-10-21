import type { AlertState } from '../../../shared/api';

export function BlockedAlertBanner({ alert, onAck, busy }: { alert: AlertState | null; onAck: () => void; busy?: boolean }) {
  if (!alert || alert.unacknowledgedBlocked <= 0) return null;
  return (
    <div className="alert" role="alert" data-testid="blocked-banner">
      <span className="x-mark" aria-hidden="true">✕</span>
      <p><strong>{alert.unacknowledgedBlocked}</strong> tentative(s) de connexion sortante bloquée(s) par le proxy
        {alert.lastBlockedAt ? ` — dernière le ${alert.lastBlockedAt.slice(0, 19).replace('T', ' ')}` : ''}.</p>
      <button type="button" className="btn sm" disabled={busy} onClick={onAck}>Acquitter</button>
    </div>
  );
}
