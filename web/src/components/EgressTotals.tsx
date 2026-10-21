import type { OutboundSummary } from '../../../shared/types';
import { fmtBytes } from './EgressTable';

export function EgressTotals({ destinations }: { destinations: OutboundSummary['destinations'] }) {
  const max = Math.max(1, ...destinations.map((d) => d.bytesUp + d.bytesDown));
  return (
    <div className="panel" style={{ marginBottom: 'var(--s3)' }} data-testid="egress-totals">
      <div className="lbl">Totaux par destination</div>
      {destinations.map((d) => (
        <div key={d.host} style={{ margin: '8px 0' }}>
          <div className="mono">{d.host} — {d.connections} conn. · ↑ {fmtBytes(d.bytesUp)} · ↓ {fmtBytes(d.bytesDown)}</div>
          <div className="bar"><i style={{ width: `${((d.bytesUp + d.bytesDown) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
