// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EgressPage } from '../../web/src/pages/EgressPage';
import { ScanOutboundPage } from '../../web/src/pages/ScanOutboundPage';
import { DisclosurePage } from '../../web/src/pages/DisclosurePage';
import { WsProvider } from '../../web/src/ws/WsProvider';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const ev = (id: string, o: object = {}) => ({ id, startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:00:01Z', host: 'api.anthropic.com', port: 443,
  bytesUp: 10, bytesDown: 20, durationMs: 5, status: 'ok', httpStatus: 200, blocked: false, purpose: 'anthropic', scanId: null, error: null, ...o });
const noAlert = { unacknowledgedBlocked: 0, lastBlockedAt: null, lastAckAt: null };

class FakeWs {
  static last: FakeWs;
  onmessage: ((m: { data: string }) => void) | null = null; onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { FakeWs.last = this; }
  close() {}
  send() {}
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockFetch(over: Record<string, (init?: RequestInit) => Response> = {}) {
  const f = vi.fn(async (u: string, init?: RequestInit) => {
    const url = String(u);
    for (const [k, v] of Object.entries(over)) if (url.includes(k)) return v(init);
    if (url.includes('/api/egress/events')) return json({ items: [ev('e1')], total: 1, page: 1, pageSize: 25 });
    if (url.includes('/api/egress/totals')) return json({ destinations: [{ host: 'api.anthropic.com', connections: 1, bytesUp: 10, bytesDown: 20 }] });
    if (url.includes('/api/egress/alerts')) return json(noAlert);
    return json({}, 404);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const renderEgress = () => render(<MemoryRouter><WsProvider><EgressPage /></WsProvider></MemoryRouter>);

describe('EgressPage', () => {
  it('adds a blocked row live, shows the banner and acks via POST /api/egress/ack', async () => {
    vi.stubGlobal('WebSocket', FakeWs);
    const f = mockFetch({ '/api/egress/ack': () => json(noAlert) });
    renderEgress();
    await screen.findByText('api.anthropic.com:443');
    const blocked = ev('e2', { host: 'statsig.anthropic.com', blocked: true, status: 'blocked', httpStatus: 403 });
    act(() => FakeWs.last.emit({ type: 'egress.event', ts: 't', data: { event: blocked, alert: { unacknowledgedBlocked: 1, lastBlockedAt: blocked.startedAt, lastAckAt: null } } }));
    await screen.findByText('statsig.anthropic.com:443');
    expect(document.querySelectorAll('tr.blocked')).toHaveLength(1);
    expect(screen.getByTestId('blocked-banner')).toBeTruthy();
    fireEvent.click(screen.getByText('Acquitter'));
    await waitFor(() => expect(screen.queryByTestId('blocked-banner')).toBeNull());
    expect(f.mock.calls.some((c) => String(c[0]) === '/api/egress/ack' && c[1]?.method === 'POST')).toBe(true);
  });
  it('sends filters as query params', async () => {
    const f = mockFetch();
    renderEgress();
    await screen.findByText('api.anthropic.com:443');
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'statsig' } });
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'blocked' } });
    fireEvent.change(screen.getByLabelText('Scan'), { target: { value: 'abc' } });
    await waitFor(() => {
      const u = f.mock.calls.map((c) => String(c[0])).find((x) => x.includes('/events') && x.includes('scanId=abc'));
      expect(u).toContain('blocked=true');
      expect(u).toContain('host=statsig');
      expect(u).toContain('page=1');
    });
  });
  it('shows loading, error and empty states', async () => {
    mockFetch({ '/api/egress/events': () => json({ error: { code: 'internal', message: 'boom' } }, 500) });
    renderEgress();
    expect(screen.getByText('Chargement du journal…')).toBeTruthy();
    await screen.findByText('boom');
    cleanup();
    mockFetch({ '/api/egress/events': () => json({ items: [], total: 0, page: 1, pageSize: 25 }) });
    renderEgress();
    await screen.findByText('Aucune connexion');
  });
});

describe('ScanOutboundPage', () => {
  it('lists files with bytes and unfolds an excerpt', async () => {
    const out = { scanId: 's1', sessions: [], reads: [{ id: 'r1', sessionId: 'x', tool: 'Read', path: 'src/a.js', pattern: null, lines: null, bytes: 2048 }],
      files: [{ path: 'src/a.js', bytes: 2048, reads: 1 }], anthropic: { connections: 3, bytesUp: 100, bytesDown: 200 }, github: [ev('g1', { host: 'github.com' })],
      summary: { files: 1, bytesToClaude: 2048, promptBytes: 10, destinations: [], blockedConnections: 0 } };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).includes('/reads/r1') ? json({ id: 'r1', path: 'src/a.js', bytes: 2048, excerpt: 'EXCERPT-BODY' }) : json(out)));
    render(<MemoryRouter initialEntries={['/scans/s1/outbound']}><Routes><Route path="/scans/:id/outbound" element={<ScanOutboundPage />} /></Routes></MemoryRouter>);
    await screen.findByText('2,0 Ko', { selector: 'td' , exact: true }).catch(() => null);
    expect(screen.getAllByText('src/a.js').length).toBe(2);
    expect(screen.getByTestId('anthropic-total').textContent).toContain('3 conn.');
    expect(screen.getByText('github.com:443')).toBeTruthy();
    fireEvent.click(screen.getByText('Extrait'));
    await screen.findByText('EXCERPT-BODY');
  });
});

describe('DisclosurePage', () => {
  it('renders markdown without raw HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ markdown: '# Titre\n\nTexte **gras** <script>alert(1)</script>\n\n- un\n- deux' })));
    render(<DisclosurePage />);
    await screen.findByText('Titre');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('strong')?.textContent).toBe('gras');
    expect(document.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByTestId('disclosure').textContent).toContain('<script>');
  });
});
