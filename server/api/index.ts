import type { FastifyInstance } from 'fastify';
import type { Config } from '../config/index.js';
import type { Repos } from '../db/repos/index.js';
import type { EgressLog } from '../egress-log/index.js';
import type { Queue } from '../queue/index.js';
import type { ReportService } from '../report/index.js';
import type { SettingsClaude } from '../settings-claude/index.js';
import type { SettingsGh } from '../settings-gh/index.js';
import { registerEgressRoutes } from './routes/egress.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerScanRoutes } from './routes/scans.js';
import { registerSettingsRoutes } from './routes/settings.js';

export interface ApiDeps {
  config: Config; repos: Repos; queue: Queue; egressLog: EgressLog; report: ReportService;
  gh: SettingsGh; claude: SettingsClaude; egressSecret: string;
}

/** Registers every /api and /internal route (auth routes are registered by registerAuth). */
export function registerApi(app: FastifyInstance, d: ApiDeps): void {
  registerMetaRoutes(app);
  registerScanRoutes(app, { repos: d.repos, queue: d.queue, egressLog: d.egressLog });
  registerReportRoutes(app, { repos: d.repos, report: d.report });
  registerEgressRoutes(app, { egressLog: d.egressLog });
  registerSettingsRoutes(app, { config: d.config, gh: d.gh, claude: d.claude });
  registerInternalRoutes(app, { egressLog: d.egressLog, secret: d.egressSecret });
}
