import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { startServer, type RunningServer } from '../../server/start.js';
import { tmpDirs } from './tmp-dirs.js';

const td = tmpDirs();

/** Boots the full app on 127.0.0.1 with random ports and fake gh/claude CLIs. */
export async function startTestApp(env: NodeJS.ProcessEnv = {}): Promise<RunningServer & { url: string; dataDir: string; cleanup(): Promise<void> }> {
  const dataDir = td.make();
  const config = loadConfig({
    SCANNER_DATA_DIR: dataDir, SCANNER_HOST: '127.0.0.1', SCANNER_PORT: '0', EGRESS_PORT: '0',
    SCANNER_GH_BIN: path.resolve('test/fixtures/fake-gh.mjs'), SCANNER_CLAUDE_BIN: path.resolve('test/fixtures/fake-claude.mjs'),
    ...env,
  });
  const srv = await startServer(config);
  return { ...srv, url: `http://127.0.0.1:${srv.port}`, dataDir,
    async cleanup() { await srv.close(); td.cleanup(); } };
}
