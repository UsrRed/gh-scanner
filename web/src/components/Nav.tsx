import { NavLink } from 'react-router-dom';
import type { AlertState } from '../../../shared/api';
import { useApi } from '../hooks/useApi';
import { useWsEvent } from '../hooks/useWsEvent';
import { useWsState, type WsState } from '../ws/WsProvider';

const LINKS = [
  { to: '/', label: 'Nouveau scan', end: true },
  { to: '/queue', label: 'File' },
  { to: '/history', label: 'Historique' },
  { to: '/egress', label: 'Sorties réseau', alerts: true },
  { to: '/settings', label: 'Paramètres' },
  { to: '/disclosure', label: "Ce que j'envoie" },
];

const WS_LABEL: Record<WsState, { dot: string; text: string }> = {
  live: { dot: 'dot live', text: 'temps réel connecté' },
  connecting: { dot: 'dot warn', text: 'connexion…' },
  down: { dot: 'dot bad', text: 'temps réel interrompu' },
};

export function Nav() {
  const ws = useWsState();
  const alerts = useApi<AlertState>('/api/egress/alerts');
  const { setData } = alerts;
  useWsEvent('egress.event', (ev) => setData(ev.data.alert));
  const blocked = alerts.data?.unacknowledgedBlocked ?? 0;
  const { dot, text } = WS_LABEL[ws];

  return (
    <nav className="nav" aria-label="Navigation principale">
      <div className="brand"><span className="brand-mark" />gh-scanner</div>
      <ul>
        {LINKS.map((l) => (
          <li key={l.to}>
            <NavLink to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              <span className="lbl">{l.label}</span>
              {l.alerts && blocked > 0 && (
                <span key={blocked} className="badge" data-testid="nav-badge" aria-label={`${blocked} connexions bloquées`}>{blocked}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="nav-foot" data-ws={ws}><span className={dot} />{text}</div>
    </nav>
  );
}
