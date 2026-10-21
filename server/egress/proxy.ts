import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { EgressEvent } from '../../shared/types.js';
import { isAllowed, resolveTarget, type AllowEntry } from './allowlist.js';
import { decodePurpose } from './purpose.js';

export interface EgressSink { write(e: EgressEvent): void; close(): Promise<void> }

export interface StartEgressOptions {
  host: string; port: number; allowlist: AllowEntry[]; hostOverrides: Record<string, string>; sink: EgressSink;
}

function parseAuthority(s: string): { host: string; port: number } | null {
  const m = /^(?:\[([^\]]+)\]|([^:\s]+)):(\d{1,5})$/.exec(s);
  if (!m) return null;
  const port = Number(m[3]);
  return port >= 1 && port <= 65535 ? { host: (m[1] ?? m[2])!.toLowerCase(), port } : null;
}

export async function startEgress(o: StartEgressOptions): Promise<{ port: number; close(): Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const emit = (e: Omit<EgressEvent, 'id' | 'durationMs'> & { t0: number }) => {
    const { t0, ...rest } = e;
    try { o.sink.write({ id: randomUUID(), durationMs: Date.now() - t0, ...rest }); } catch { /* never break the tunnel */ }
  };

  const server = http.createServer((req, res) => {
    // Plain HTTP proxying is not supported: only CONNECT tunnels.
    const t0 = Date.now();
    let host = 'unknown'; let port = 80;
    try { const u = new URL(req.url ?? ''); host = u.hostname; port = Number(u.port) || 80; } catch { /* ignore */ }
    const { purpose, scanId } = decodePurpose(req.headers['proxy-authorization'] as string | undefined, host);
    emit({ t0, startedAt: new Date(t0).toISOString(), endedAt: new Date().toISOString(), host, port, bytesUp: 0, bytesDown: 0,
      status: 'blocked', httpStatus: 403, blocked: true, purpose, scanId, error: 'plain HTTP not allowed' });
    res.writeHead(403, { 'Content-Type': 'text/plain', Connection: 'close' }).end('blocked by egress proxy\n');
  });

  server.on('connect', (req, client: net.Socket, head) => {
    const t0 = Date.now();
    sockets.add(client); client.on('close', () => sockets.delete(client));
    client.on('error', () => {});
    const auth = parseAuthority(req.url ?? '');
    const host = auth?.host ?? (req.url ?? 'unknown');
    const port = auth?.port ?? 0;
    const { purpose, scanId } = decodePurpose(req.headers['proxy-authorization'] as string | undefined, host);
    const base = { t0, startedAt: new Date(t0).toISOString(), host, port, purpose, scanId };

    if (!auth || !isAllowed(o.allowlist, host, port)) {
      emit({ ...base, endedAt: new Date().toISOString(), bytesUp: 0, bytesDown: 0, status: 'blocked', httpStatus: 403,
        blocked: true, error: 'destination not in allowlist' });
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    let bytesUp = head.length; let bytesDown = 0; let done = false; let established = false;
    const finish = (error: string | null) => {
      if (done) return; done = true;
      emit({ ...base, endedAt: new Date().toISOString(), bytesUp, bytesDown,
        status: established ? (error ? 'error' : 'ok') : 'error', httpStatus: established ? 200 : 502, blocked: false, error });
    };
    const target = resolveTarget(o.hostOverrides, host, port);
    const upstream = net.connect(target.port, target.host);
    sockets.add(upstream);
    upstream.on('close', () => { sockets.delete(upstream); client.destroy(); finish(null); });
    upstream.on('error', (err) => {
      if (!established) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      finish(err.message);
      upstream.destroy();
    });
    client.on('close', () => { upstream.destroy(); finish(null); });
    client.on('error', () => upstream.destroy());
    upstream.on('connect', () => {
      established = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.on('data', (d) => { bytesUp += d.length; });
      upstream.on('data', (d) => { bytesDown += d.length; });
      client.pipe(upstream); upstream.pipe(client);
    });
  });

  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(o.port, o.host, resolve); });
  return {
    port: (server.address() as net.AddressInfo).port,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.(); });
      await o.sink.close();
    },
  };
}
