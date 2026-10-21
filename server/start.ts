import { mkdirSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { buildApp } from './app.js';
import { initClaudeRunner } from './claude-runner/index.js';
import { assertStartupAllowed, type Config } from './config/index.js';
import { openDb } from './db/index.js';
import { ensureSharedSecret, startEgress } from './egress/index.js';
import { log } from './log.js';
import { initRedaction, registerSecret } from './redact/index.js';

export interface RunningServer { app: FastifyInstance; port: number; close(): Promise<void> }

/** Boots the whole app: db, shared secret, embedded egress (when no external one), global dispatcher, queue recovery, listen. */
export async function startServer(config: Config, opts: { installDispatcher?: boolean } = {}): Promise<RunningServer> {
  assertStartupAllowed(config);
  for (const d of [config.dataDir, config.workDir]) mkdirSync(d, { recursive: true, mode: 0o700 });
  initRedaction({ dataDir: config.dataDir, workDir: config.workDir, hostname: hostname(), username: userInfo().username, homeDir: homedir() });
  const db = openDb(path.join(config.dataDir, 'scanner.db'));
  const egressSecret = ensureSharedSecret(config.egressSharedDir);
  registerSecret(egressSecret, 'secret');
  initClaudeRunner(config);

  const app = await buildApp({ config, db, egressSecret });
  const { gh, egressLog, queue } = app.services;
  gh.verifyStoragePermissions();

  let embedded: { close(): Promise<void> } | null = null;
  if (!config.egressUrl) {
    const proxy = await startEgress({ host: config.egressHost, port: config.egressPort, allowlist: config.egressAllowlist,
      hostOverrides: config.egressHostOverrides,
      sink: { write: (e) => egressLog.ingest([e]), close: async () => {} } });
    config.egressPort = proxy.port;
    embedded = proxy;
  }
  const previous = getGlobalDispatcher();
  const install = opts.installDispatcher ?? true;
  if (install) {
    const target = config.egressUrl ?? `http://127.0.0.1:${config.egressPort}`;
    const u = new URL(target);
    u.username = 'app'; u.password = 'x';
    setGlobalDispatcher(new ProxyAgent({ uri: u.toString() }));
  }

  const close = async (): Promise<void> => {
    await app.close();
    await embedded?.close();
    if (install) { await getGlobalDispatcher().close().catch(() => {}); setGlobalDispatcher(previous); }
    db.close();
  };
  try {
    await queue.recover();
    await app.listen({ host: config.host, port: config.port });
  } catch (e) { await close(); throw e; }
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  log.info(`gh-scanner listening on http://${config.host}:${port}`);
  return { app, port, close };
}
