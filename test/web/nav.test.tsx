// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../web/src/components/AppShell';
import { WsProvider } from '../../web/src/ws/WsProvider';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('AppShell', () => {
  it('shows nav links, alert badge and ws indicator', async () => {
    vi.stubGlobal('WebSocket', class { onclose = null; close() {} });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unacknowledgedBlocked: 3, lastBlockedAt: null, lastAckAt: null }))));
    render(<MemoryRouter><WsProvider><AppShell>contenu</AppShell></WsProvider></MemoryRouter>);
    expect(screen.getByText('Historique')).toBeTruthy();
    expect(screen.getByText('contenu')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(screen.getByText('connexion…')).toBeTruthy();
  });
});
