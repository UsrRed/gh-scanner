import { afterEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EgressEvent } from '../../shared/types.js';
import { startEgress, decodePurpose, parseAllowlist, createHttpShipper, type EgressSink } from '../../server/egress/index.js';
import { startEchoUpstream } from '../fixtures/echo-upstream.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of closers.splice(0)) await c(); td.cleanup(); });

function memSink(): EgressSink & { events: EgressEvent[] } {
  const events: EgressEvent[] = [];
  return { events, write: (e) => { events.push(e); }, close: async () => {} };
}
const waitFor = async (f: () => boolean, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } };

function connect(proxyPort: number, target: string, auth?: string): Promise<{ status: number; sock: net.Socket; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => {
      s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth ? `Proxy-Authorization: Basic ${Buffer.from(auth).toString('base64')}\r\n` : ''}\r\n`);
    });
    s.once('data', (d) => {
      const i = d.indexOf('\r\n\r\n');
      resolve({ status: Number(d.toString().slice(9, 12)), sock: s, rest: d.subarray(i + 4) });
    });
    s.on('error', reject);
  });
}

async function setup(allow = 'fake.example:443') {
  const up = await startEchoUpstream();
  const sink = memSink();
  const p = await startEgress({ host: '127.0.0.1', port: 0, allowlist: parseAllowlist(allow),
    hostOverrides: { 'fake.example:443': `127.0.0.1:${up.port}` }, sink });
  closers.push(p.close, up.close);
  return { up, sink, p };
}

describe('egress proxy', () => {
  it('tunnels allowed host and journals bytes, purpose, duration', async () => {
    const { sink, p } = await setup();
    const { status, sock } = await connect(p.port, 'fake.example:443', 'scan.abc-1.claude.mapping:x');
    expect(status).toBe(200);
    const got = new Promise<string>((r) => sock.once('data', (d) => r(d.toString())));
    sock.write('hello');
    expect(await got).toBe('ECHO:hello');
    sock.end();
    await waitFor(() => sink.events.length === 1);
    const e = sink.events[0]!;
    expect(e).toMatchObject({ host: 'fake.example', port: 443, status: 'ok', httpStatus: 200, blocked: false,
      bytesUp: 5, bytesDown: 10, purpose: 'scan.abc-1.claude.mapping', scanId: 'abc-1' });
    expect(e.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(e.endedAt)).toBeGreaterThanOrEqual(Date.parse(e.startedAt));
  });

  it('blocks hosts outside allowlist (statsig, wrong port) with 403 and blocked event', async () => {
    const { sink, p } = await setup(
      'api.anthropic.com,console.anthropic.com');
    for (const t of ['statsig.anthropic.com:443', 'api.anthropic.com:80', 'evil.example:443']) {
      const r = await connect(p.port, t);
      expect(r.status).toBe(403);
      r.sock.destroy();
    }
    await waitFor(() => sink.events.length === 3);
    expect(sink.events.every((e) => e.blocked && e.status === 'blocked' && e.httpStatus === 403)).toBe(true);
    expect(sink.events[0]!.host).toBe('statsig.anthropic.com');
  });

  it('default config allowlist excludes statsig', async () => {
    const { loadConfig } = await import('../../server/config/index.js');
    const c = loadConfig({});
    expect(c.egressAllowlist.some((a) => a.host === 'statsig.anthropic.com')).toBe(false);
  });
});

describe('purpose', () => {
  it('decodes Proxy-Authorization, falls back by host', () => {
    const h = (u: string) => 'Basic ' + Buffer.from(u).toString('base64');
    expect(decodePurpose(h('scan:s1:clone:x'), 'github.com')).toEqual({ purpose: 'scan.s1.clone', scanId: 's1' });
    expect(decodePurpose(h('settings.gh-login:x'), 'github.com')).toEqual({ purpose: 'settings.gh-login', scanId: null });
    expect(decodePurpose(undefined, 'api.github.com').purpose).toBe('github');
    expect(decodePurpose(undefined, 'api.anthropic.com').purpose).toBe('anthropic');
    expect(decodePurpose('garbage', 'x.example').purpose).toBe('unknown');
  });
});

describe('shipper', () => {
  it('spools when app is down, then replays and sends secret', async () => {
    const dir = td.make();
    const spool = path.join(dir, 'spool.jsonl');
    const received: EgressEvent[] = []; let secret = '';
    let up = false;
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        if (!up) { res.writeHead(503).end(); return; }
        secret = String(req.headers['x-egress-secret']);
        received.push(...(JSON.parse(b) as { events: EgressEvent[] }).events);
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    closers.push(() => new Promise<void>((r) => { srv.closeAllConnections(); srv.close(() => r()); }));
    const port = (srv.address() as net.AddressInfo).port;
    const sink = createHttpShipper({ appUrl: `http://127.0.0.1:${port}`, secret: 's3cret', spoolFile: spool, retryMs: 100 });
    closers.push(() => sink.close());
    const ev: EgressEvent = { id: 'e1', startedAt: 'a', endedAt: 'b', host: 'h', port: 443, bytesUp: 1, bytesDown: 2,
      durationMs: 3, status: 'ok', httpStatus: 200, blocked: false, purpose: 'app', scanId: null, error: null };
    sink.write(ev);
    await waitFor(() => existsSync(spool) && readFileSync(spool, 'utf8').includes('"e1"'));
    expect(JSON.parse(readFileSync(spool, 'utf8').trim())).toMatchObject({ id: 'e1' });
    up = true;
    await waitFor(() => received.length === 1);
    expect(secret).toBe('s3cret');
    expect(received[0]!.id).toBe('e1');
    await waitFor(() => readFileSync(spool + '.replay', 'utf8') === '' && (!existsSync(spool) || readFileSync(spool, 'utf8') === ''));
  });
});
