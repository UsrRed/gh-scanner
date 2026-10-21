import { useEffect, useState } from 'react';
import type { ClaudeStatus, GhFlow, SettingsView } from '../../../shared/api';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/StateViews';
import { XtermConsole } from '../components/XtermConsole';
import { useApi } from '../hooks/useApi';
import { useWsEvent } from '../hooks/useWsEvent';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

function remaining(expiresAt: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function DeviceCode({ code }: { code: string }) {
  return (
    <div className="device" aria-label={`code ${code}`} data-testid="device-code">
      {[...code].map((c, i) => <span key={i} className={c === '-' ? 'dash' : undefined}>{c === '-' ? '–' : c}</span>)}
    </div>
  );
}

function GithubPanel({ view, onChange }: { view: SettingsView['github']; onChange: (g: Partial<SettingsView['github']>) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const flow = view.activeFlow;
  const pending = flow?.state === 'starting' || flow?.state === 'pending';

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending]);

  // repli si le WS est coupé
  useEffect(() => {
    if (!pending || !flow) return;
    const t = setInterval(() => {
      apiGet<GhFlow>(`/api/settings/github/login/${flow.id}`).then((f) => onChange({ activeFlow: f }), () => {});
    }, 3000);
    return () => clearInterval(t);
  }, [pending, flow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  const start = () => run(async () => onChange({ activeFlow: await apiPost<GhFlow>('/api/settings/github/login') }));
  const cancel = () => flow && run(async () => onChange({ activeFlow: await apiDelete<GhFlow>(`/api/settings/github/login/${flow.id}`) }));
  const logout = () => run(async () => {
    const s = await apiPost<SettingsView['github']>('/api/settings/github/logout');
    onChange({ connected: s.connected, login: s.login, scopes: s.scopes, error: s.error, activeFlow: null });
  });

  return (
    <div className="panel">
      <h3>GitHub</h3>
      {pending && flow ? (
        <>
          <div className="status-line"><span className="dot warn" />
            {flow.state === 'starting' ? 'démarrage…' : `en attente de validation · expire dans ${remaining(flow.expiresAt, now)}`}
          </div>
          {flow.userCode && (
            <>
              <p style={{ margin: '16px 0 0' }}>
                Ouvrez <a className="mono" href={flow.verificationUrl ?? undefined} target="_blank" rel="noreferrer noopener">{flow.verificationUrl}</a> sur n'importe quel appareil et saisissez :
              </p>
              <DeviceCode code={flow.userCode} />
            </>
          )}
          <p className="hint">Aucun navigateur n'est ouvert sur le serveur. Trafic : settings:gh-login → github.com.</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {flow.userCode && <button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(flow.userCode!)}>Copier le code</button>}
            <button type="button" className="btn sm danger" disabled={busy} onClick={cancel}>Annuler</button>
          </div>
        </>
      ) : view.connected ? (
        <>
          <div className="status-line"><span className="dot" />connecté · <b>@{view.login}</b>{view.scopes.length > 0 && ` · scopes ${view.scopes.join(', ')}`}</div>
          <button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={logout}>Se déconnecter</button>
        </>
      ) : (
        <>
          <div className="status-line">
            <span className={`dot ${flow?.state === 'expired' || flow?.state === 'error' ? 'bad' : 'warn'}`} />
            {flow?.state === 'expired' ? 'code expiré'
              : flow?.state === 'error' ? `erreur · ${flow.message ?? 'échec de la connexion'}`
              : flow?.state === 'cancelled' ? 'connexion annulée' : 'non connecté'}
          </div>
          {view.error && !flow && <p className="hint err">{view.error}</p>}
          <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={busy} onClick={start}>
            {flow?.state === 'expired' || flow?.state === 'error' ? 'Réessayer' : 'Se connecter'}
          </button>
        </>
      )}
      {error && <p className="hint err" role="alert">{error}</p>}
    </div>
  );
}

const CHECK_LABEL = { ok: 'opérationnel', not_authenticated: 'non authentifié', error: 'erreur' } as const;

function ClaudePanel({ status, onChange }: { status: ClaudeStatus; onChange: (s: ClaudeStatus) => void }) {
  const [consoleId, setConsoleId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status.cliLoggedIn && consoleId) closeConsole(); }, [status.cliLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(null); }
  }
  function closeConsole() {
    const id = consoleId;
    setConsoleId(null);
    if (id) void apiDelete(`/api/settings/claude/console/${id}`).catch(() => {});
  }
  const openConsole = () => run('console', async () => {
    const r = await apiPost<{ consoleId: string }>('/api/settings/claude/console');
    setConsoleId(r.consoleId);
  });
  const save = () => run('save', async () => {
    const r = await apiPut<ClaudeStatus>('/api/settings/claude/api-key', { apiKey: apiKey.trim() });
    setApiKey('');
    onChange(r);
  });
  const remove = () => run('delete', async () => onChange(await apiDelete<ClaudeStatus>('/api/settings/claude/api-key')));
  const verify = () => run('verify', async () => onChange(await apiPost<ClaudeStatus>('/api/settings/claude/verify')));
  const check = status.lastCheck;

  return (
    <div className="panel">
      <h3>Claude</h3>
      <div className="tabs"><span className="on">A · Login CLI</span></div>
      {consoleId ? (
        <>
          <XtermConsole consoleId={consoleId} onExit={() => closeConsole()} />
          <p className="hint">Console fermée automatiquement après connexion ou au bout de 15 min.</p>
          <button type="button" className="btn sm danger" onClick={closeConsole}>Fermer la console</button>
        </>
      ) : (
        <>
          <div className="status-line"><span className={`dot ${status.cliLoggedIn ? '' : 'warn'}`} />
            {status.cliLoggedIn ? 'connecté via le login CLI' : 'login CLI non effectué'}</div>
          <button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={busy === 'console'} onClick={openConsole}>Ouvrir la console de login</button>
        </>
      )}
      <hr style={{ border: 0, borderTop: '1px dashed var(--rule-strong)', margin: '16px 0' }} />
      <div className="field">
        <label htmlFor="api-key">Clé API (option B)</label>
        {status.apiKeyHint ? (
          <>
            <div className="secret">
              <input id="api-key" readOnly disabled value={status.apiKeyHint} />
              <button type="button" className="btn sm danger" disabled={busy === 'delete'} onClick={remove}>Supprimer</button>
            </div>
            <span className="hint">lecture seule après enregistrement</span>
          </>
        ) : (
          <div className="secret">
            <input id="api-key" type="password" autoComplete="off" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button type="button" className="btn sm primary" disabled={!/^sk-ant-/.test(apiKey.trim()) || busy === 'save'} onClick={save}>Enregistrer</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" disabled={busy === 'verify'} onClick={verify}>Revérifier</button>
        {check && (
          <span className="status-line" style={{ flex: 1 }} role="status">
            <span className={`dot ${check.state === 'ok' ? '' : check.state === 'error' ? 'bad' : 'warn'}`} />
            {CHECK_LABEL[check.state]}{check.message && ` · ${check.message}`}
          </span>
        )}
      </div>
      {error && <p className="hint err" role="alert">{error}</p>}
    </div>
  );
}

export function SettingsPage() {
  const s = useApi<SettingsView>('/api/settings');
  useWsEvent('settings.gh_login', (ev) => {
    const flow = ev.data.flow;
    s.setData(s.data && { ...s.data, github: { ...s.data.github, activeFlow: flow } });
    if (flow.state === 'connected') s.reload();
  });
  useWsEvent('settings.claude', (ev) => s.setData(s.data && { ...s.data, claude: ev.data.status }));

  return (
    <>
      <PageHeader title="Paramètres" sub="Aucun secret n'est jamais réaffiché" />
      {s.loading && !s.data ? <LoadingState /> : s.error && !s.data ? (
        <ErrorState code={s.error.code} message={s.error.message} onRetry={s.reload} />
      ) : s.data ? (
        <>
          <div className="grid2">
            <GithubPanel view={s.data.github}
              onChange={(g) => s.setData({ ...s.data!, github: { ...s.data!.github, ...g } })} />
            <ClaudePanel status={s.data.claude} onChange={(c) => s.setData({ ...s.data!, claude: c })} />
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Exposition</h3>
            <dl className="kv" style={{ maxWidth: 520 }}>
              <dt>authentification</dt><dd>{s.data.auth.required ? 'mot de passe requis' : 'optionnelle · mot de passe non défini'}</dd>
              <dt>proxy de sortie</dt><dd>{s.data.egress.mode === 'embedded' ? 'embarqué' : 'externe'} · {s.data.egress.allowlist.length} hôtes autorisés</dd>
              <dt>modèles</dt><dd>{s.data.models.analysis} / {s.data.models.synthesis}</dd>
              <dt>télémétrie</dt><dd>désactivée · DO_NOT_TRACK=1</dd>
            </dl>
          </div>
        </>
      ) : null}
    </>
  );
}
