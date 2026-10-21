import net from 'node:net';

export interface EchoUpstream { port: number; connections: number; received: () => Buffer; close: () => Promise<void> }

/** Fake upstream TCP server: replies "ECHO:" + data. (TLS is tunnelled opaquely by the proxy, plain TCP suffices.) */
export async function startEchoUpstream(): Promise<EchoUpstream> {
  const chunks: Buffer[] = [];
  const sockets = new Set<net.Socket>();
  const state = { connections: 0 };
  const server = net.createServer((s) => {
    state.connections++;
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('error', () => {});
    s.on('data', (d) => { chunks.push(d); s.write(Buffer.concat([Buffer.from('ECHO:'), d])); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: (server.address() as net.AddressInfo).port,
    get connections() { return state.connections; },
    received: () => Buffer.concat(chunks),
    close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}
