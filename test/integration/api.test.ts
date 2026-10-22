import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling, AppError } from '../../server/api/errors.js';
import { registerSecurityHeaders } from '../../server/api/security-headers.js';
import { registerScanRoutes } from '../../server/api/routes/scans.js';
import { registerReportRoutes } from '../../server/api/routes/reports.js';
import { registerMetaRoutes } from '../../server/api/routes/meta.js';
import { createReportService } from '../../server/report/index.js';
import { createQueue } from '../../server/queue/index.js';
import { openDb } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { loadConfig } from '../../server/config/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterEach(() => td.cleanup());

async function setup() {
  const dir = td.make();
  initRedaction({ dataDir: dir, workDir: `${dir}/work`, hostname: 'h', username: 'u', homeDir: '/home/u' });
  const config = loadConfig({ SCANNER_DATA_DIR: dir, SCANNER_WORK_DIR: `${dir}/work` });
  const db = openDb(`${dir}/db.sqlite`);
  const repos = createRepos(db);
  const queue = createQueue({ config, db, broadcast: () => {}, pipeline: () => new Promise(() => {}) });
  const egressLog = { forScan: () => [], summaryForScan: () => ({ destinations: [], blockedConnections: 0 }) };
  const report = createReportService({ repos, egressLog });
  const app = Fastify();
  registerErrorHandling(app); registerSecurityHeaders(app);
  registerMetaRoutes(app);
  registerScanRoutes(app, { repos, queue, egressLog });
  registerReportRoutes(app, { repos, report });
  app.get('/boom', async () => { throw new Error('secret stack /etc/passwd'); });
  app.get('/app-err', async () => { throw new AppError('conflict', 409, 'nope'); });
  return { app, repos };
}

describe('api', () => {
  it('rejects invalid repos with 400', async () => {
    const { app } = await setup();
    for (const repo of ['evil.com/x', '../x', '-x']) {
      const r = await app.inject({ method: 'POST', url: '/api/scans', payload: { repo } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
    }
    const bad = await app.inject({ method: 'POST', url: '/api/scans', payload: { repo: 'a/b', ref: '-x' } });
    expect(bad.statusCode).toBe(400);
  });

  it('hides internal errors', async () => {
    const { app } = await setup();
    const r = await app.inject('/boom');
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: { code: 'internal', message: 'Internal server error' } });
    expect(r.body).not.toMatch(/passwd|stack| at /);
    expect((await app.inject('/app-err')).json().error.code).toBe('conflict');
    expect((await app.inject('/nope')).json().error.code).toBe('not_found');
  });

  it('sets security headers', async () => {
    const { app } = await setup();
    const r = await app.inject('/api/health');
    expect(r.headers['content-security-policy']).toMatch(/default-src 'self'.*frame-ancestors 'none'/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });

  it('creates, lists, gets scans and 404s', async () => {
    const { app } = await setup();
    const c = await app.inject({ method: 'POST', url: '/api/scans', payload: { repo: 'octo/hello' } });
    expect(c.statusCode).toBe(201);
    const id = c.json().id;
    expect((await app.inject(`/api/scans/${id}`)).json().repo).toBe('octo/hello');
    expect((await app.inject('/api/scans?repo=octo/hello&pageSize=5')).json().total).toBe(1);
    expect((await app.inject(`/api/scans/${id}/logs`)).json()).toEqual({ items: [] });
    expect((await app.inject('/api/scans/zzz')).statusCode).toBe(404);
    expect((await app.inject(`/api/scans/${id}/report`)).statusCode).toBe(409);
    expect((await app.inject(`/api/scans/${id}/outbound`)).json().scanId).toBe(id);
  });

  it('exports masked md/json for a finished scan', async () => {
    const { app, repos } = await setup();
    const id = (await app.inject({ method: 'POST', url: '/api/scans', payload: { repo: 'octo/hello' } })).json().id;
    repos.scans.update(id, { status: 'done', finishedAt: new Date().toISOString() });
    const token = 'ghp_' + 'a'.repeat(36);
    repos.findings.insertMany([{ id: 'fid1', scanId: id, severity: 'high', category: 'secrets', rule: 'r', title: 't', file: 'a.js', line: 1,
      snippet: `x=${token}`, explanation: 'e', fix: 'f', source: 'local', fingerprint: 'f'.repeat(64), risk: { vulnerability: 'v', threat: 'th', probability: 'high', impact: 'high' } }]);
    const md = await app.inject(`/api/scans/${id}/export?format=md`);
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.headers['content-disposition']).toMatch(/attachment/);
    const js = await app.inject(`/api/scans/${id}/export?format=json`);
    expect(js.json().schemaVersion).toBe(1);
    expect(md.body + js.body).not.toContain(token);
    expect((await app.inject(`/api/scans/${id}/export?format=x`)).statusCode).toBe(400);
    expect((await app.inject(`/api/compare?base=${id}&head=${id}`)).statusCode).toBe(200);
  });

  it('serves the disclosure', async () => {
    const { app } = await setup();
    const md = (await app.inject('/api/disclosure')).json().markdown as string;
    for (const s of ['api.anthropic.com', 'github.com', 'statsig.anthropic.com']) expect(md).toContain(s);
  });
});
