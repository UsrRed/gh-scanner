import { useEffect, useRef } from 'react';
import type { WsEvent } from '../../../shared/ws';
import { useWsSubscribe } from '../ws/WsProvider';

export function useWsEvent<T extends WsEvent['type']>(type: T, handler: (ev: Extract<WsEvent, { type: T }>) => void): void {
  const subscribe = useWsSubscribe();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () => subscribe((ev) => { if (ev.type === type) ref.current(ev as Extract<WsEvent, { type: T }>); }),
    [subscribe, type],
  );
}
