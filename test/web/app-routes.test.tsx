// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../web/src/App';
import { WsProvider } from '../../web/src/ws/WsProvider';

vi.mock('../../web/src/pages/NewScanPage', () => ({ NewScanPage: () => <div data-testid="page-NewScanPage" /> }));
vi.mock('../../web/src/pages/QueuePage', () => ({ QueuePage: () => <div data-testid="page-QueuePage" /> }));
vi.mock('../../web/src/pages/HistoryPage', () => ({ HistoryPage: () => <div data-testid="page-HistoryPage" /> }));
vi.mock('../../web/src/pages/EgressPage', () => ({ EgressPage: () => <div data-testid="page-EgressPage" /> }));
vi.mock('../../web/src/pages/DisclosurePage', () => ({ DisclosurePage: () => <div data-testid="page-DisclosurePage" /> }));
vi.mock('../../web/src/pages/SettingsPage', () => ({ SettingsPage: () => <div data-testid="page-SettingsPage" /> }));
vi.mock('../../web/src/pages/ComparePage', () => ({ ComparePage: () => <div data-testid="page-ComparePage" /> }));
vi.mock('../../web/src/pages/ScanLivePage', () => ({ ScanLivePage: () => <div data-testid="page-ScanLivePage" /> }));
vi.mock('../../web/src/pages/ReportPage', () => ({ ReportPage: () => <div data-testid="page-ReportPage" /> }));
vi.mock('../../web/src/pages/ScanOutboundPage', () => ({ ScanOutboundPage: () => <div data-testid="page-ScanOutboundPage" /> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stub(handler: (url: string) => Response) {
  vi.stubGlobal('WebSocket', class { onclose = null; close() {} });
  vi.stubGlobal('fetch', vi.fn(async (u: string) => handler(u)));
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
const open = (u: string) => u.includes('/auth/me') ? json({ authRequired: false, authenticated: true, csrfToken: null })
  : u.includes('/egress/alerts') ? json({ unacknowledgedBlocked: 2, lastBlockedAt: null, lastAckAt: null })
  : json({ items: [], total: 0, page: 1, pageSize: 20 });
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><WsProvider><App /></WsProvider></MemoryRouter>);

describe('App routing', () => {
  it('unknown route renders NotFoundPage', async () => {
    stub(open);
    mount('/nope/at/all');
    await waitFor(() => expect(screen.getByTestId('not-found')).toBeTruthy());
  });
  it.each([['/', 'NewScanPage'], ['/queue', 'QueuePage'], ['/history', 'HistoryPage'], ['/egress', 'EgressPage'],
    ['/disclosure', 'DisclosurePage'], ['/settings', 'SettingsPage'], ['/compare', 'ComparePage'], ['/scans/x', 'ScanLivePage'],
    ['/scans/x/report', 'ReportPage'], ['/scans/x/outbound', 'ScanOutboundPage']])('%s renders %s', async (p, name) => {
    stub(open);
    mount(p);
    await waitFor(() => expect(screen.getByTestId(`page-${name}`)).toBeTruthy());
  });
  it('shows nav badge for unacknowledged alerts', async () => {
    stub(open);
    mount('/');
    await waitFor(() => expect(screen.getByTestId('nav-badge').textContent).toBe('2'));
  });
  it('auth required and unauthenticated redirects to login', async () => {
    stub((u) => u.includes('/auth/me') ? json({ authRequired: true, authenticated: false, csrfToken: null }) : json({}, 401));
    mount('/history');
    await waitFor(() => expect(screen.getByText(/mot de passe/i)).toBeTruthy());
  });
  it('a 401 from the API switches to login', async () => {
    stub((u) => u.includes('/auth/me') ? json({ authRequired: true, authenticated: true, csrfToken: 't' })
      : json({ error: { code: 'unauthorized', message: 'no' } }, 401));
    mount('/history');
    await waitFor(() => expect(screen.getByText(/mot de passe/i)).toBeTruthy());
  });
});
