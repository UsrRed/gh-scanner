import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/** Terminal xterm branché sur /ws/pty/:consoleId (login CLI Claude). */
export function XtermConsole({ consoleId, onExit }: { consoleId: string; onExit?: (reason: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({ fontFamily: 'ui-monospace, monospace', fontSize: 12, cursorBlink: true,
      theme: { background: '#16140F', foreground: '#E8E4D6' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const doFit = () => { try { fit.fit(); } catch { /* not laid out */ } };
    doFit();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/pty/${encodeURIComponent(consoleId)}`);
    const send = (o: unknown) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    ws.onopen = () => { doFit(); send({ t: 'resize', cols: term.cols, rows: term.rows }); };
    ws.onmessage = (m) => {
      try {
        const msg = JSON.parse(String(m.data)) as { t: string; d?: string; reason?: string };
        if (msg.t === 'out' && msg.d) term.write(msg.d);
        else if (msg.t === 'exit') exit.current?.(msg.reason ?? 'exit');
      } catch { /* ignore */ }
    };
    ws.onclose = () => exit.current?.('closed');
    const sub = term.onData((d) => send({ t: 'in', d }));
    const onResize = () => { doFit(); send({ t: 'resize', cols: term.cols, rows: term.rows }); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sub.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
    };
  }, [consoleId]);

  return <div ref={host} className="term xterm-host" data-testid="xterm-console" style={{ minHeight: 220, padding: 4 }} />;
}
