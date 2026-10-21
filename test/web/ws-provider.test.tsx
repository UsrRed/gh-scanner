// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { WsProvider, useWsState } from '../../web/src/ws/WsProvider';
import { useWsEvent } from '../../web/src/hooks/useWsEvent';

class FakeWs {
  static all: FakeWs[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  constructor(public url: string) { FakeWs.all.push(this); }
  close() { this.onclose?.(); }
}

function Probe({ onHello }: { onHello: (v: string) => void }) {
  useWsEvent('hello', (e) => onHello(e.data.serverVersion));
  return <span data-testid="s">{useWsState()}</span>;
}

beforeEach(() => { vi.useFakeTimers(); FakeWs.all = []; vi.stubGlobal('WebSocket', FakeWs); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('WsProvider', () => {
  it('goes live, dispatches events, reconnects with backoff', () => {
    const hello = vi.fn();
    render(<WsProvider url="ws://t/ws"><Probe onHello={hello} /></WsProvider>);
    expect(screen.getByTestId('s').textContent).toBe('connecting');
    act(() => FakeWs.all[0]!.onopen!());
    expect(screen.getByTestId('s').textContent).toBe('live');
    act(() => FakeWs.all[0]!.onmessage!({ data: JSON.stringify({ type: 'hello', ts: 't', data: { serverVersion: '1' } }) }));
    expect(hello).toHaveBeenCalledWith('1');

    act(() => FakeWs.all[0]!.close());
    expect(screen.getByTestId('s').textContent).toBe('down');
    act(() => { vi.advanceTimersByTime(499); });
    expect(FakeWs.all.length).toBe(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeWs.all.length).toBe(2);
    // second failure without open → doubled delay
    act(() => FakeWs.all[1]!.close());
    act(() => { vi.advanceTimersByTime(999); });
    expect(FakeWs.all.length).toBe(2);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeWs.all.length).toBe(3);
  });
});
