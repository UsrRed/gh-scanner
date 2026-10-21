import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config/index.js';
import type { Db } from './db/index.js';
import { createRepos } from './db/repos/index.js';
import { registerApi } from './api/index.js';
import { registerErrorHandling } from './api/errors.js';
import { registerSecurityHeaders } from './api/security-headers.js';
import { registerAuth } from './auth/index.js';
import { createEgressLog, type EgressLog } from './egress-log/index.js';
import { createQueue, type Queue } from './queue/index.js';
import { createReportService } from './report/index.js';
import { createSettingsClaude } from './settings-claude/index.js';
import { createSettingsGh, type SettingsGh } from './settings-gh/index.js';
import { createWsHub } from './ws/index.js';
import { registerPtyBridge } from './ws/pty-bridge.js';
import { webDistDir } from './paths.js';

export interface AppDeps { config: Config; db: Db; egressSecret: string; webDir?: string; serverVersion?: string }
export interface AppServices { queue: Queue; egressLog: EgressLog; gh: SettingsGh }

declare module 'fastify' {
  interface FastifyInstance { services: AppServices }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const webDir = deps.webDir ?? webDistDir();
  const hasWeb = existsSync(path.join(webDir, 'index.html'));
  const app = Fastify({ trustProxy: false, bodyLimit: 1024 * 1024 });

  registerSecurityHeaders(app);
  const isApiPath = (url: string): boolean => /^\/(api|internal|ws)(\/|\?|$)/.test(url);
  registerErrorHandling(app, {
    notFound: (req, reply) => (hasWeb && req.method === 'GET' && !isApiPath(req.url)
      ? reply.type('text/html; charset=utf-8').sendFile('index.html') : undefined),
  });
  await registerAuth(app, { db, config });

  const ws = createWsHub({ serverVersion: deps.serverVersion ?? '0.1.0' });
  await ws.register(app);

  const repos = createRepos(db);
  const egressLog = createEgressLog({ repos, ws });
  const gh = createSettingsGh(config, {
    onChange: (flow) => ws.broadcast({ type: 'settings.gh_login', ts: new Date().toISOString(), data: { flow } }),
  });
  const claude = createSettingsClaude(config, {
    onConsoleExit: () => ws.broadcast({ type: 'settings.claude', ts: new Date().toISOString(), data: { status: claude.status() } }),
  });
  registerPtyBridge(app, { claude });
  const queue = createQueue({ config, db, broadcast: (e) => ws.broadcast(e) });
  const report = createReportService({ repos, egressLog });
  registerApi(app, { config, repos, queue, egressLog, report, gh, claude, egressSecret: deps.egressSecret });

  if (hasWeb) await app.register(fastifyStatic, { root: webDir, wildcard: false, index: ['index.html'] });

  app.decorate('services', { queue, egressLog, gh });
  app.addHook('onClose', async () => { await queue.stop(); });
  return app;
}
