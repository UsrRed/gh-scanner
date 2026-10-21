import type { FastifyInstance } from 'fastify';
import { ReportError, type ReportService } from '../../report/index.js';
import type { Repos } from '../../db/repos/index.js';
import { AppError } from '../errors.js';

const FINAL = ['done', 'failed', 'cancelled', 'budget_exceeded'];

export function registerReportRoutes(app: FastifyInstance, deps: { repos: Repos; report: ReportService }): void {
  const { repos, report } = deps;
  const wrap = <T>(fn: () => T): T => {
    try { return fn(); } catch (e) {
      if (e instanceof ReportError) {
        throw e.code === 'not_found' ? new AppError('not_found', 404, 'Scan not found') : new AppError('repo_mismatch', 400, e.message);
      }
      throw e;
    }
  };
  const ready = (id: string): void => {
    const s = repos.scans.get(id);
    if (!s) throw new AppError('not_found', 404, 'Scan not found');
    const hasResult = repos.findings.listByScan(id).length > 0 || repos.scans.meta(id)?.partial === true;
    if (!FINAL.includes(s.status) && !hasResult) throw new AppError('conflict', 409, 'Scan not finished');
  };

  app.get<{ Params: { id: string } }>('/api/scans/:id/report', async (req) => {
    ready(req.params.id);
    return wrap(() => report.buildReport(req.params.id));
  });

  app.get<{ Querystring: { base?: string; head?: string; a?: string; b?: string } }>('/api/compare', async (req) => {
    const base = req.query.base ?? req.query.a; const head = req.query.head ?? req.query.b;
    if (!base || !head) throw new AppError('bad_request', 400, 'base and head are required');
    return wrap(() => report.compareScans(base, head));
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>('/api/scans/:id/export', async (req, reply) => {
    const format = req.query.format ?? 'json';
    if (format !== 'json' && format !== 'md') throw new AppError('bad_request', 400, 'format must be json or md');
    ready(req.params.id);
    const name = `scan-${req.params.id}.${format}`;
    reply.header('Content-Disposition', `attachment; filename="${name}"`);
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(wrap(() => report.exportMarkdown(req.params.id)));
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(wrap(() => report.exportJson(req.params.id))));
  });
}
