// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WsProvider } from '../../web/src/ws/WsProvider';
import { NewScanPage } from '../../web/src/pages/NewScanPage';
import { QueuePage } from '../../web/src/pages/QueuePage';
import { ScanLivePage } from '../../web/src/pages/ScanLivePage';

const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
const mkScan = (o: object = {}) => ({ id: 's1', repo: 'a/b', ref: null, keepClone: false, status: 'queued', failure: null, queuePosition: 2,
  commitSha: null, createdAt: '', startedAt: null, finishedAt: null, usage, score: null, claudeVerdict: null, previousScanId: null, ...o });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

let sockets: { onmessage: ((m: { data: string }) => void) | null }[] = [];
function stubWs() {
  sockets = [];
  vi.stubGlobal('WebSocket', class { onmessage: ((m: { data: string }) => void) | null = null; onopen = null; onclose = null; onerror = null;
    constructor() { sockets.push(this); } close() {} });
}
const push = (ev: object) => act(() => { sockets.forEach((s) => s.onmessage?.({ data: JSON.stringify(ev) })); });
const wrap = (ui: React.ReactNode, path = '/') => render(<MemoryRouter initialEntries={[path]}><WsProvider>{ui}</WsProvider></MemoryRouter>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('NewScanPage', () => {
  it('shows the server error under the field', async () => {
    stubWs();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'invalid_repo', message: 'Dépôt invalide' } }, 400)));
    wrap(<NewScanPage />);
    fireEvent.change(screen.getByLabelText('Dépôt'), { target: { value: 'evil.com/x' } });
    fireEvent.click(screen.getByText('Lancer le scan'));
    const alert = await screen.findByText('Dépôt invalide');
    expect(alert.closest('#repo-err')).toBeTruthy();
    expect(screen.getByLabelText('Dépôt').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('ScanLivePage', () => {
  it('updates the step track on scan.status without reload', async () => {
    stubWs();
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u.endsWith('/logs') ? json({ items: [] }) : json(mkScan()))));
    wrap(<Routes><Route path="/scans/:id" element={<ScanLivePage />} /></Routes>, '/scans/s1');
    await screen.findByText('position 2 dans la file');
    expect(document.querySelector('[data-step="queued"]')!.className).toContain('active');
    await push({ type: 'scan.status', ts: '2026-01-01T00:00:00Z', data: { scan: mkScan({ status: 'mapping', queuePosition: null }) } });
    await waitFor(() => expect(document.querySelector('[data-step="mapping"]')!.className).toContain('active'));
    expect(document.querySelector('[data-step="cloning"]')!.className).toContain('done');
    await push({ type: 'scan.log', ts: '2026-01-01T00:00:01Z', data: { scanId: 's1', seq: 1, level: 'info', message: 'hello log' } });
    expect(screen.getByText('hello log')).toBeTruthy();
    await push({ type: 'scan.usage', ts: '', data: { scanId: 's1', pass: 'mapping', batch: null, usage, total: { ...usage, inputTokens: 750000, costUsd: 1 }, budget: { usd: 2, tokens: 1500000 } } });
    expect(screen.getByLabelText('Tokens').getAttribute('aria-valuenow')).toBe('50');
  });
});

describe('QueuePage', () => {
  it('shows loading, empty, error and rows with cancel', async () => {
    stubWs();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    wrap(<QueuePage />);
    expect(screen.getByText('Chargement de la file…')).toBeTruthy();
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async () => json({ running: [], queued: [] })));
    wrap(<QueuePage />);
    await screen.findByText('File vide');
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'internal', message: 'boom' } }, 500)));
    wrap(<QueuePage />);
    await screen.findByText('boom');
    cleanup();

    const f = vi.fn(async (_u: string, init?: { method?: string }) => (init?.method === 'POST' ? json(mkScan({ status: 'cancelled' })) : json({ running: [], queued: [mkScan()] })));
    vi.stubGlobal('fetch', f);
    wrap(<QueuePage />);
    await screen.findByLabelText('Position 2');
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(f).toHaveBeenCalledWith('/api/scans/s1/cancel', expect.objectContaining({ method: 'POST' })));
  });
});
