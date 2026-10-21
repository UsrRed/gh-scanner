import { Link } from 'react-router-dom';
import type { Scan } from '../../../shared/types';

export function QueueRow({ scan, onCancel, busy }: { scan: Scan; onCancel: (id: string) => void; busy?: boolean }) {
  const queued = scan.status === 'queued';
  return (
    <div className="queue-row" data-scan={scan.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="pos" aria-label={queued ? `Position ${scan.queuePosition ?? '?'}` : 'En cours'}>
          {queued ? (scan.queuePosition ?? '?') : '▶'}
        </span>
        <Link to={`/scans/${scan.id}`}>{scan.repo}{scan.ref ? `@${scan.ref}` : ''}</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{queued ? 'en file' : scan.status}</span>
        <button type="button" className="btn sm danger" disabled={busy} onClick={() => onCancel(scan.id)}>Annuler</button>
      </div>
    </div>
  );
}
