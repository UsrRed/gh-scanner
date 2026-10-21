import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerErrorHandling } from '../../server/api/errors.js';
import { registerEgressRoutes } from '../../server/api/routes/egress.js';
import { registerInternalRoutes } from '../../server/api/routes/internal.js';
import { registerSettingsRoutes } from '../../server/api/routes/settings.js';
import { createEgressLog } from '../../server/egress-log/index.js';
import { createSettingsGh } from '../../server/settings-gh/index.js';
import { createSettingsClaude } from '../../server/settings-claude/index.js';
import { openDb } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { loadConfig } from '../../server/config/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';
import { waitFor } from '../helpers/wait-for-status.js';

const td = tmpDirs();
afterEach(() => td.cleanup());

const KEY = 'sk-ant-api03-SUPERSECRETKEY1234';
const ev = (id: string, blocked: boolean) => ({
  id, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), host: 'evil.com', port: 443, bytesUp: 1, bytesDown: 2,
  durationMs: 5, status: blocked ? 'blocked' : 'ok', httpStatus: blocked ? 403 : 200, blocked, purpose: 'app', scanId: null, error: null,
});

function setup() {
  const dir = td.make();
  initRedaction({ dataDir: dir, workDir: `${dir}/work`, hostname: 'h', username: 'u', homeDir: '/home/u' });
  mkdirSync(path.join(dir, 'gh'), { recursive: true });
  writeFileSync(path.join(dir, 'gh', '.fake-gh.json'), JSON.stringify({ loggedIn: false }));
  const config = loadConfig({ SCANNER_DATA_DIR: dir, SCANNER_WORK_DIR: `${dir}/work`, SCANNER_GH_BIN: path.resolve('test/fixtures/fake-gh.mjs') });
  const repos = createRepos(openDb(`${dir}/db.sqlite`));
  const egressLog = createEgressLog({ repos, ws: { broadcast: () => {} } });
  const gh = createSettingsGh(config);
  const claude = createSettingsClaude(config);
  const app = Fastify();
  registerErrorHandling(app);
  registerEgressRoutes(app, { egressLog });
  registerInternalRoutes(app, { egressLog, secret: 's3cret' });
  registerSettingsRoutes(app, { config, gh, claude });
  return { app };
}

describe('settings/egress api', () => {
  it('GET /api/settings exposes no api key or token', async () => {
    const { app } = setup();
    const put = await app.inject({ method: 'PUT', url: '/api/settings/claude/api-key', payload: { apiKey: KEY } });
    expect(put.statusCode).toBe(200);
    const r = await app.inject('/api/settings');
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain('SUPERSECRETKEY');
    expect(r.body).not.toMatch(/gho_/);
    expect(r.json().claude).toMatchObject({ mode: 'api-key', apiKeyHint: 'sk-ant-…1234' });
    expect(put.body).not.toContain('SUPERSECRETKEY');
    expect((await app.inject({ method: 'PUT', url: '/api/settings/claude/api-key', payload: { apiKey: 'bad' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/settings/claude/api-key' })).json().mode).toBe('none');
  });

  it('internal events require the shared secret', async () => {
    const { app } = setup();
    const payload = { events: [ev('e1', true)] };
    expect((await app.inject({ method: 'POST', url: '/internal/egress/events', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/internal/egress/events', payload, headers: { 'x-egress-secret': 'nope' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/internal/egress/events', payload, headers: { 'x-egress-secret': 's3cret' } });
    expect(ok.statusCode).toBe(204);
    expect((await app.inject('/api/egress?blocked=true')).json().total).toBe(1);
    expect((await app.inject('/api/egress/totals')).json().destinations[0].host).toBe('evil.com');
  });

  it('ack resets the alert', async () => {
    const { app } = setup();
    await app.inject({ method: 'POST', url: '/internal/egress/events', payload: { events: [ev('e1', true)] }, headers: { 'x-egress-secret': 's3cret' } });
    expect((await app.inject('/api/egress/alerts')).json().unacknowledgedBlocked).toBe(1);
    const a = await app.inject({ method: 'POST', url: '/api/egress/ack' });
    expect(a.json().unacknowledgedBlocked).toBe(0);
    expect((await app.inject('/api/egress/alerts')).json().unacknowledgedBlocked).toBe(0);
  });

  it('github login returns code and url', async () => {
    const { app } = setup();
    const start = await app.inject({ method: 'POST', url: '/api/settings/github/login' });
    expect(start.statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: '/api/settings/github/login' })).statusCode).toBe(409);
    const id = start.json().id;
    const flow = await waitFor(async () => (await app.inject(`/api/settings/github/login/${id}`)).json(), (f) => f.state !== 'starting');
    expect(flow).toMatchObject({ userCode: 'ABCD-1234', verificationUrl: 'https://github.com/login/device' });
    expect((await app.inject({ method: 'DELETE', url: `/api/settings/github/login/${id}` })).statusCode).toBe(200);
    expect((await app.inject('/api/settings/github/login/zzz')).statusCode).toBe(404);
  });
});
