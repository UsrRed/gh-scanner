import net from 'node:net';

/** Plain TCP relay (Docker: publishes the app port while the app only sits on an internal network). */
export async function startIngressRelay(o: { port: number; target: string }): Promise<{ close(): Promise<void> }> {
  const i = o.target.lastIndexOf(':');
  const tHost = o.target.slice(0, i); const tPort = Number(o.target.slice(i + 1));
  const sockets = new Set<net.Socket>();
  const server = net.createServer((c) => {
    const u = net.connect(tPort, tHost);
    for (const s of [c, u]) { sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => { c.destroy(); u.destroy(); }); }
    c.pipe(u); u.pipe(c);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(o.port, '0.0.0.0', resolve); });
  return { close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }) };
}
