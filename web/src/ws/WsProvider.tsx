import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WsEvent } from '../../../shared/ws';

export type WsState = 'live' | 'connecting' | 'down';
type Listener = (ev: WsEvent) => void;

interface WsContextValue {
  state: WsState;
  subscribe: (l: Listener) => () => void;
}

const WsContext = createContext<WsContextValue>({ state: 'down', subscribe: () => () => {} });

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 15_000;
export const backoffDelay = (attempt: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);

function defaultUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function WsProvider({ children, url }: { children: ReactNode; url?: string }) {
  const [state, setState] = useState<WsState>('connecting');
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setState('connecting');
      const ws = new WebSocket(url ?? defaultUrl());
      socket = ws;
      ws.onopen = () => {
        attempt = 0;
        setState('live');
      };
      ws.onmessage = (m) => {
        let ev: WsEvent;
        try {
          ev = JSON.parse(String(m.data)) as WsEvent;
        } catch {
          return;
        }
        listeners.current.forEach((l) => l(ev));
      };
      ws.onclose = () => {
        if (stopped) return;
        setState('down');
        timer = setTimeout(connect, backoffDelay(attempt++));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [url]);

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => void listeners.current.delete(l);
  }, []);
  const value = useMemo(() => ({ state, subscribe }), [state, subscribe]);
  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

export const useWsState = (): WsState => useContext(WsContext).state;
export const useWsSubscribe = (): WsContextValue['subscribe'] => useContext(WsContext).subscribe;
