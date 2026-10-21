import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../../config/index.js';
import { authRequired } from '../../config/index.js';
import { FlowInProgressError, type SettingsGh } from '../../settings-gh/index.js';
import { ConsoleInProgressError, InvalidApiKeyError, type SettingsClaude } from '../../settings-claude/index.js';
import { AppError } from '../errors.js';

const keyBody = z.object({ apiKey: z.string().min(1).max(512) });

export function registerSettingsRoutes(app: FastifyInstance, deps: { config: Config; gh: SettingsGh; claude: SettingsClaude }): void {
  const { config, gh, claude } = deps;

  app.get('/api/settings', async () => ({
    auth: { required: authRequired(config) },
    github: { ...(await gh.status()), activeFlow: gh.getFlow() },
    claude: claude.status(),
    models: { analysis: config.modelAnalysis, synthesis: config.modelSynthesis },
    budget: { usd: config.budgetUsd, tokens: config.budgetTokens },
    egress: {
      mode: config.egressUrl ? 'external' : 'embedded',
      allowlist: config.egressAllowlist.map((e) => `${e.host}:${e.port}`),
    },
    concurrency: config.concurrency,
  }));

  app.post('/api/settings/github/login', async (_req, reply) => {
    try { return reply.code(202).send(gh.startLogin()); }
    catch (e) {
      if (e instanceof FlowInProgressError) throw new AppError('flow_in_progress', 409, e.message);
      throw e;
    }
  });
  app.get<{ Params: { flowId: string } }>('/api/settings/github/login/:flowId', async (req) => {
    const f = gh.getFlow(req.params.flowId);
    if (!f) throw new AppError('not_found', 404, 'Unknown login flow');
    return f;
  });
  app.delete<{ Params: { flowId: string } }>('/api/settings/github/login/:flowId', async (req) => {
    const f = await gh.cancelFlow(req.params.flowId);
    if (!f) throw new AppError('not_found', 404, 'Unknown login flow');
    return f;
  });
  app.post('/api/settings/github/logout', async () => gh.logout());

  app.put('/api/settings/claude/api-key', async (req) => {
    const p = keyBody.safeParse(req.body);
    if (!p.success) throw new AppError('bad_request', 400, 'apiKey is required');
    try { return claude.setApiKey(p.data.apiKey); }
    catch (e) {
      if (e instanceof InvalidApiKeyError) throw new AppError('bad_request', 400, 'Invalid API key format');
      throw e;
    }
  });
  app.delete('/api/settings/claude/api-key', async () => claude.deleteApiKey());
  app.post('/api/settings/claude/verify', async () => {
    await claude.verify();
    return claude.status();
  });
  app.post('/api/settings/claude/console', async (_req, reply) => {
    try { return reply.code(201).send(claude.openConsole()); }
    catch (e) {
      if (e instanceof ConsoleInProgressError) throw new AppError('conflict', 409, e.message);
      throw e;
    }
  });
  app.delete<{ Params: { id: string } }>('/api/settings/claude/console/:id', async (req, reply) => {
    if (!claude.closeConsole(req.params.id)) throw new AppError('not_found', 404, 'Unknown console');
    return reply.code(204).send();
  });
}
