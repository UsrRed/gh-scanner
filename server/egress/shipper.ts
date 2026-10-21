import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { EgressEvent } from '../../shared/types.js';
import type { EgressSink } from './proxy.js';

/** Ships events to the app (`POST /internal/egress/events`); failed batches are spooled to JSONL and replayed. */
export function createHttpShipper(o: { appUrl: string; secret: string; spoolFile: string; retryMs?: number }): EgressSink {
  const url = new URL('/internal/egress/events', o.appUrl).toString();
  let queue: EgressEvent[] = [];
  let sending = false;
  let closed = false;

  const post = async (events: EgressEvent[]): Promise<boolean> => {
    try {
      const r = await fetch(url, { method: 'POST', body: JSON.stringify({ events }),
        headers: { 'content-type': 'application/json', 'x-egress-secret': o.secret }, signal: AbortSignal.timeout(5000) });
      return r.ok;
    } catch { return false; }
  };
  const spool = (events: EgressEvent[]) => {
    try { appendFileSync(o.spoolFile, events.map((e) => JSON.stringify(e) + '\n').join(''), { mode: 0o600 }); } catch { /* ignore */ }
  };
  const readSpool = (): EgressEvent[] => {
    if (!existsSync(o.spoolFile)) return [];
    const out: EgressEvent[] = [];
    for (const l of readFileSync(o.spoolFile, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { out.push(JSON.parse(l) as EgressEvent); } catch { /* skip corrupt line */ }
    }
    return out;
  };

  const flush = async () => {
    if (sending) return;
    sending = true;
    try {
      const batch = queue; queue = [];
      if (batch.length && !(await post(batch))) spool(batch);
      else if (batch.length) await replay();
    } finally { sending = false; }
  };
  const replay = async () => {
    const pending = readSpool();
    if (!pending.length) return;
    // Move aside first so concurrent spooling is not lost.
    const tmp = `${o.spoolFile}.replay`;
    renameSync(o.spoolFile, tmp);
    if (await post(pending)) { writeFileSync(tmp, ''); return; }
    appendFileSync(o.spoolFile, readFileSync(tmp));
    writeFileSync(tmp, '');
  };

  const timer = setInterval(() => {
    if (sending || closed) return;
    sending = true;
    replay().finally(() => { sending = false; });
  }, o.retryMs ?? 5000);
  timer.unref();

  return {
    write(e) { queue.push(e); void flush(); },
    async close() {
      closed = true; clearInterval(timer);
      while (sending) await new Promise((r) => setTimeout(r, 10));
      await flush();
    },
  };
}
