import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import Fastify, { type FastifyInstance } from 'fastify';
import { openDb, type Db } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { createWsHub, type WsHub } from '../../server/ws/index.js';
import { createEgressLog, type EgressLog } from '../../server/egress-log/index.js';
import type { EgressEvent } from '../../shared/types.js';
import type { WsEvent } from '../../shared/ws.js';

const TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const ev = (id: string, over: Partial<EgressEvent> = {}): EgressEvent => ({ id, startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:01Z',
  host: 'api.anthropic.com', port: 443, bytesUp: 10, bytesDown: 20, durationMs: 1000, status: 'ok', httpStatus: 200, blocked: false,
  purpose: 'app', scanId: null, error: null, ...over });

let dir: string; let db: Db; let app: FastifyInstance; let hub: WsHub; let log: EgressLog; let url: string; let authOk = true;
beforeEach(async () => {
  initRedaction({ dataDir: '/data', workDir: '/data/work', hostname: 'myhost', username: 'alice', homeDir: '/home/alice' });
  dir = mkdtempSync(join(tmpdir(), 'eglog-'));
  db = openDb(join(dir, 's.db'));
  hub = createWsHub(); log = createEgressLog({ repos: createRepos(db), ws: hub });
  app = Fastify(); authOk = true;
  await hub.register(app, { authorize: () => authOk });
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}/ws`;
});
afterEach(async () => { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

function connect(): Promise<{ ws: WebSocket; msgs: WsEvent[] }> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const msgs: WsEvent[] = [];
    ws.on('message', (d) => { msgs.push(JSON.parse(String(d))); if (msgs.length === 1) res({ ws, msgs }); });
    ws.on('error', rej);
  });
}
const waitFor = async (fn: () => boolean) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };

describe('ws hub + egress-log', () => {
  it('client receives egress.event after ingest, redacted', async () => {
    const { ws, msgs } = await connect();
    expect(msgs[0]!.type).toBe('hello');
    log.ingest([ev('a', { error: `boom ${TOKEN}` })]);
    await waitFor(() => msgs.length > 1);
    expect(msgs[1]!.type).toBe('egress.event');
    expect(JSON.stringify(msgs)).not.toContain(TOKEN);
    expect(JSON.stringify(msgs[1])).toContain('REDACTED');
    ws.close();
  });

  it('rejects unauthorized upgrade', async () => {
    authOk = false;
    await expect(connect()).rejects.toBeTruthy();
  });

  it('blocked connection alerts until acknowledged', async () => {
    expect(log.alertState().unacknowledgedBlocked).toBe(0);
    log.ingest([ev('a', { blocked: true, status: 'blocked', httpStatus: 403, host: 'evil.com' }), ev('b')]);
    expect(log.alertState().unacknowledgedBlocked).toBe(1);
    expect(log.alertState().lastBlockedAt).toBe('2026-01-01T00:00:00Z');
    const s = log.acknowledge();
    expect(s.unacknowledgedBlocked).toBe(0);
    expect(s.lastAckAt).toBeTruthy();
    log.ingest([ev('c', { blocked: true, startedAt: new Date(Date.now() + 5000).toISOString() })]);
    expect(log.alertState().unacknowledgedBlocked).toBe(1);
  });

  it('filters, paginates and totals per destination', () => {
    log.ingest([
      ev('1', { scanId: 's1', purpose: 'scan.s1.claude.mapping', startedAt: '2026-01-01T00:00:01Z' }),
      ev('2', { scanId: 's1', host: 'github.com', bytesUp: 5, bytesDown: 7, startedAt: '2026-01-01T00:00:02Z' }),
      ev('3', { host: 'evil.com', blocked: true, status: 'blocked', startedAt: '2026-01-01T00:00:03Z' }),
      ev('4', { startedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(log.list({ host: 'github.com' }, 1, 10).total).toBe(1);
    expect(log.list({ purpose: 'scan.s1.claude.mapping' }, 1, 10).total).toBe(1);
    expect(log.list({ scanId: 's1' }, 1, 10).total).toBe(2);
    expect(log.list({ blocked: true }, 1, 10).items[0]!.id).toBe('3');
    expect(log.list({ from: '2026-01-01T12:00:00Z' }, 1, 10).total).toBe(1);
    const p = log.list({}, 2, 3);
    expect(p.total).toBe(4); expect(p.items).toHaveLength(1);
    const t = log.totals({});
    expect(t.find((d) => d.host === 'api.anthropic.com')).toMatchObject({ connections: 2, bytesUp: 20, bytesDown: 40 });
    expect(log.summaryForScan('s1')).toMatchObject({ blockedConnections: 0, destinations: [{ host: 'api.anthropic.com' }, { host: 'github.com' }] });
    expect(log.forScan('s1')).toHaveLength(2);
  });
});
