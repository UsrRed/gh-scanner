// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportPage } from '../../web/src/pages/ReportPage';
import { HistoryPage } from '../../web/src/pages/HistoryPage';
import { ComparePage } from '../../web/src/pages/ComparePage';

const usage = { inputTokens: 1500, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 1.6 };
const mkScan = (o: object = {}) => ({ id: 's1abcdefgh', repo: 'a/b', ref: null, keepClone: false, status: 'done', failure: null, queuePosition: null,
  commitSha: 'abcdef123', createdAt: '2026-01-01T00:00:00Z', startedAt: null, finishedAt: null, usage, score: 21, claudeVerdict: 'do-not-install', previousScanId: null, ...o });
const mkF = (id: string, severity: string, category = 'secrets') => ({ id, scanId: 's1', severity, category, rule: 'r', title: `T-${id}`, file: 'x/y.env', line: 12,
  snippet: 'KEY=AKIA…', explanation: `expl-${id}`, fix: `fix-${id}`, source: 'local', fingerprint: 'a'.repeat(64) });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const report = {
  scan: mkScan(), score: 21, scoreFormula: '100 − 40×1 crit. = 60', claudeVerdict: 'do-not-install', justification: 'Dangereux.',
  counts: { critical: 1, high: 1, medium: 0, low: 0, info: 0 }, findings: [mkF('1', 'critical'), mkF('2', 'high', 'ci-cd')],
  passes: [{ pass: 'mapping', batch: null, model: 'm', usage, status: 'ok' }],
  outbound: { files: 14, bytesToClaude: 49000, promptBytes: 100, destinations: [{ host: 'api.anthropic.com', connections: 9, bytesUp: 1, bytesDown: 1 }], blockedConnections: 2 }, partial: false,
};
const at = (ui: React.ReactNode, path: string, route: string) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={ui} /></Routes></MemoryRouter>);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ReportPage', () => {
  it('renders stamp, score, counters, outbound, usage and filters by severity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(report)));
    at(<ReportPage />, '/scans/s1/report', '/scans/:id/report');
    await screen.findByText('T-1');
    expect(screen.getByTestId('stamp').textContent).toContain('ne pas installer');
    expect(screen.getByTestId('score').textContent).toContain('21');
    expect(document.querySelectorAll('.counters > div')).toHaveLength(5);
    expect(screen.getAllByText('x/y.env:12', { selector: '.loc' }).length).toBe(2);
    expect(screen.getByText('expl-1')).toBeTruthy();
    expect(screen.getByText('fix-1')).toBeTruthy();
    expect(screen.getByText('Récapitulatif des sorties')).toBeTruthy();
    expect(screen.getByTestId('usage-total')).toBeTruthy();
    expect(screen.getByText('T-2')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtres' })).getByText('critique'));
    expect(screen.getByText('T-1')).toBeTruthy();
    expect(screen.queryByText('T-2')).toBeNull();
  });
  it('shows loading, error and empty states', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'not_found', message: 'Scan not found' } }, 404)));
    at(<ReportPage />, '/scans/s1/report', '/scans/:id/report');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    await screen.findByRole('alert');
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...report, findings: [], counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } })));
    at(<ReportPage />, '/scans/s1/report', '/scans/:id/report');
    await screen.findByText('Aucun finding');
  });
});

describe('HistoryPage', () => {
  it('lists scans, filters by repo and navigates to compare with two selections', async () => {
    const fetchMock = vi.fn(async (_u: string) => json({ items: [mkScan({ id: 'old', createdAt: '2026-01-01' }), mkScan({ id: 'new', createdAt: '2026-02-01', score: 68 })], total: 2, page: 1, pageSize: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter initialEntries={['/history']}><Routes>
      <Route path="/history" element={<HistoryPage />} /><Route path="/compare" element={<div>COMPARE-PAGE</div>} /></Routes></MemoryRouter>);
    await screen.findAllByText('a/b');
    fireEvent.change(screen.getByLabelText('Dépôt'), { target: { value: 'a/b' } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('repo=a%2Fb'))).toBe(true));
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]!); fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByText(/Comparer/));
    await screen.findByText('COMPARE-PAGE');
  });
  it('shows loading, error and empty states', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'internal', message: 'boom' } }, 500)));
    at(<HistoryPage />, '/history', '/history');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    await screen.findByText('boom');
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [], total: 0, page: 1, pageSize: 20 })));
    at(<HistoryPage />, '/history', '/history');
    await screen.findByText('Aucun scan');
  });
});

describe('ComparePage', () => {
  it('shows added/resolved/persisting and the score delta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ repo: 'a/b', base: mkScan({ score: 21 }), head: mkScan({ id: 'h', score: 68 }), scoreDelta: 47,
      added: [mkF('a', 'medium')], resolved: [mkF('r1', 'critical'), mkF('r2', 'high')], persisting: [mkF('p', 'low')] })));
    at(<ComparePage />, '/compare?base=x&head=y', '/compare');
    await screen.findByText('T-a');
    expect(screen.getByTestId('delta').textContent).toBe('+47');
    const count = (c: string) => document.querySelectorAll(`[data-col="${c}"] .item`).length;
    expect([count('added'), count('resolved'), count('persisting')]).toEqual([1, 2, 1]);
  });
  it('shows empty, loading and error states', async () => {
    at(<ComparePage />, '/compare', '/compare');
    expect(screen.getByText('Aucune comparaison')).toBeTruthy();
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'repo_mismatch', message: 'mismatch' } }, 400)));
    at(<ComparePage />, '/compare?base=x&head=y', '/compare');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    await screen.findByText('mismatch');
  });
});
