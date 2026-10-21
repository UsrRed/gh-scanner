import { useEffect, useRef } from 'react';

export interface LogLine { seq: number; ts?: string; level: 'info' | 'warn' | 'error'; message: string }

const CLS = { info: 'out', warn: 'warn', error: 'bad' } as const;

export function LogTerminal({ lines, live }: { lines: LogLine[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div className="term" ref={ref} role="log" aria-live="off" aria-label="Journal du scan">
      {lines.length === 0 && <div className="t">En attente de logs…</div>}
      {lines.map((l) => (
        <div key={l.seq}>
          {l.ts && <span className="t">{l.ts.slice(11, 19)} </span>}
          <span className={CLS[l.level]}>{l.message}</span>
        </div>
      ))}
      {live && <span className="cursor" />}
    </div>
  );
}
