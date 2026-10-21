// Egress proxy entry (→ dist/egress.js): CONNECT proxy + event shipper + optional ingress relay.
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { startEgress, createHttpShipper, startIngressRelay, ensureSharedSecret } from './egress/index.js';

async function main(): Promise<void> {
  const env = { ...process.env, EGRESS_HOST: process.env.EGRESS_HOST ?? '0.0.0.0' };
  const c = loadConfig({ SCANNER_DATA_DIR: process.env.SCANNER_DATA_DIR ?? '/data', ...env });
  const secret = ensureSharedSecret(c.egressSharedDir);
  const sink = createHttpShipper({ appUrl: c.egressAppUrl, secret, spoolFile: path.join(c.egressSharedDir, 'spool.jsonl') });
  const proxy = await startEgress({ host: c.egressHost, port: c.egressPort, allowlist: c.egressAllowlist,
    hostOverrides: c.egressHostOverrides, sink });
  const relay = c.egressIngressPort
    ? await startIngressRelay({ port: c.egressIngressPort, target: c.egressIngressTarget ?? 'app:8417' }) : null;
  console.log(`egress listening on ${c.egressHost}:${proxy.port}`);
  const stop = () => { void Promise.all([proxy.close(), relay?.close()]).finally(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
