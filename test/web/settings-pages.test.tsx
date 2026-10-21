// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../web/src/components/XtermConsole', () => ({ XtermConsole: () => <div data-testid="xterm-console" /> }));

import { SettingsPage } from '../../web/src/pages/SettingsPage';
import { LoginPage } from '../../web/src/pages/LoginPage';
import { WsProvider } from '../../web/src/ws/WsProvider';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
class FakeWs {
  static last: FakeWs;
  onmessage: ((m: { data: string }) => void) | null = null; onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { FakeWs.last = this; }
  close() {} send() {}
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
const base = (o: Record<string, unknown> = {}) => ({
  auth: { required: false },
  github: { connected: false, login: null, scopes: [], error: null, activeFlow: null },
  claude: { mode: 'none', cliLoggedIn: false, apiKeyHint: null, lastCheck: null },
  models: { analysis: 'a', synthesis: 's' }, budget: { usd: 2, tokens: 1 }, egress: { mode: 'embedded', allowlist: ['x'] }, concurrency: 1, ...o });
const flow = (o: object = {}) => ({ id: 'f1', state: 'pending', userCode: '8F3K-Q2WX', verificationUrl: 'https://github.com/login/device', expiresAt: new Date(Date.now() + 600000).toISOString(), message: null, ...o });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderPage = () => render(<MemoryRouter><WsProvider><SettingsPage /></WsProvider></MemoryRouter>);
function mock(view: unknown, over: Record<string, () => Response> = {}) {
  vi.stubGlobal('WebSocket', FakeWs);
  const f = vi.fn(async (u: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${u}`;
    for (const [k, v] of Object.entries(over)) if (key.includes(k)) return v();
    if (key === 'GET /api/settings') return json(view);
    return json({}, 404);
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('SettingsPage', () => {
  it('shows loading then error state', async () => {
    mock(null, { 'GET /api/settings': () => json({ error: { code: 'internal', message: 'boum' } }, 500) });
    renderPage();
    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(await screen.findByText('boum')).toBeTruthy();
  });

  it('displays device code and URL for a pending flow, then connected via WS', async () => {
    mock(base({ github: { connected: false, login: null, scopes: [], error: null, activeFlow: flow() } }));
    renderPage();
    expect(await screen.findByLabelText('code 8F3K-Q2WX')).toBeTruthy();
    expect(screen.getByText('https://github.com/login/device')).toBeTruthy();
    FakeWs.last.emit({ type: 'settings.gh_login', ts: 'x', data: { flow: flow({ state: 'connected' }) } });
    await waitFor(() => expect(screen.queryByLabelText('code 8F3K-Q2WX')).toBeNull());
  });

  it('starts a flow on click', async () => {
    mock(base(), { 'POST /api/settings/github/login': () => json(flow(), 202) });
    renderPage();
    fireEvent.click(await screen.findByText('Se connecter'));
    expect(await screen.findByLabelText('code 8F3K-Q2WX')).toBeTruthy();
  });

  it('shows connected login and expired state', async () => {
    mock(base({ github: { connected: true, login: 'octo', scopes: ['repo'], error: null, activeFlow: null } }));
    renderPage();
    expect(await screen.findByText('@octo')).toBeTruthy();
    cleanup();
    mock(base({ github: { connected: false, login: null, scopes: [], error: null, activeFlow: flow({ state: 'expired' }) } }));
    renderPage();
    expect(await screen.findByText('code expiré')).toBeTruthy();
  });

  it('saves the API key then shows only the masked, disabled field', async () => {
    const hint = 'sk-ant-…3f9a';
    mock(base(), { 'PUT /api/settings/claude/api-key': () => json({ mode: 'api-key', cliLoggedIn: false, apiKeyHint: hint, lastCheck: null }) });
    renderPage();
    const input = (await screen.findByLabelText('Clé API (option B)')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-secret-3f9a' } });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => expect((screen.getByLabelText('Clé API (option B)') as HTMLInputElement).value).toBe(hint));
    const after = screen.getByLabelText('Clé API (option B)') as HTMLInputElement;
    expect(after.disabled).toBe(true);
    expect(document.body.innerHTML).not.toContain('secret-3f9a');
  });

  it.each([['ok', 'opérationnel'], ['not_authenticated', 'non authentifié'], ['error', 'erreur']])('verify shows %s', async (state, label) => {
    mock(base(), { 'POST /api/settings/claude/verify': () => json({ mode: 'none', cliLoggedIn: false, apiKeyHint: null, lastCheck: { state, message: 'm', at: 'now' } }) });
    renderPage();
    fireEvent.click(await screen.findByText('Revérifier'));
    expect((await screen.findByRole('status')).textContent).toContain(label);
  });

  it('opens the login console and closes it once logged in', async () => {
    mock(base(), { 'POST /api/settings/claude/console': () => json({ consoleId: 'c1', expiresAt: 'x' }, 201), 'DELETE /api/settings/claude/console': () => new Response(null, { status: 204 }) });
    renderPage();
    fireEvent.click(await screen.findByText('Ouvrir la console de login'));
    expect(await screen.findByTestId('xterm-console')).toBeTruthy();
    FakeWs.last.emit({ type: 'settings.claude', ts: 'x', data: { status: { mode: 'cli-login', cliLoggedIn: true, apiKeyHint: null, lastCheck: null } } });
    await waitFor(() => expect(screen.queryByTestId('xterm-console')).toBeNull());
  });
});

describe('LoginPage', () => {
  it('shows an error on 401 and calls onLoggedIn on success', async () => {
    const on = vi.fn();
    let ok = false;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => u.includes('login') ? (ok ? new Response(null, { status: 204 }) : json({ error: { code: 'unauthorized', message: 'no' } }, 401)) : json({ authRequired: true, authenticated: true, csrfToken: 't' })));
    render(<LoginPage onLoggedIn={on} />);
    fireEvent.change(screen.getByLabelText('Mot de passe administrateur'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Entrer'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    ok = true;
    fireEvent.click(screen.getByText('Entrer'));
    await waitFor(() => expect(on).toHaveBeenCalled());
  });
});
