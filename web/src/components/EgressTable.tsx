import type { EgressEvent } from '../../../shared/types';

export const fmtBytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1).replace('.', ',')} Ko` : `${n} o`);

export function EgressTable({ events, fresh }: { events: EgressEvent[]; fresh?: Set<string> }) {
  return (
    <div className="panel" style={{ padding: 0, overflow: 'auto', marginBottom: 'var(--s3)' }}>
      <table>
        <thead><tr><th>Heure</th><th>Destination</th><th>Finalité</th><th>Statut</th><th className="num">↑</th><th className="num">↓</th><th className="num hide-m">Durée</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={`${e.blocked ? 'blocked' : ''}${fresh?.has(e.id) ? ' fresh' : ''}`.trim()} data-testid="egress-row">
              <td className="mono">{e.startedAt.slice(11, 19)}</td>
              <td className="mono">{e.host}:{e.port}</td>
              <td className="mono">{e.purpose}</td>
              <td className="mono">{e.blocked ? 'BLOQUÉ' : e.status} · {e.httpStatus}</td>
              <td className="num">{fmtBytes(e.bytesUp)}</td>
              <td className="num">{fmtBytes(e.bytesDown)}</td>
              <td className="num hide-m">{e.durationMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
