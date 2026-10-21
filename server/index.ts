// App entry (→ dist/index.js).
import { loadConfig, assertStartupAllowed } from './config/index.js';
import { startServer } from './start.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  assertStartupAllowed(config);
  process.umask(0o077);
  const srv = await startServer(config);
  const stop = (): void => { void srv.close().finally(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
