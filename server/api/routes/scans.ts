import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Scan, ScanStatus } from '../../../shared/types.js';
import type { Repos } from '../../db/repos/index.js';
import type { EgressLog } from '../../egress-log/index.js';
import type { Queue } from '../../queue/index.js';
import { parseRepoInput } from '../../repo-input/index.js';
import { redact } from '../../redact/index.js';
import { AppError } from '../errors.js';

const STATUSES = ['queued', 'cloning', 'mapping', 'analyzing', 'synthesizing', 'done', 'failed', 'cancelled', 'budget_exceeded'] as const;
const createBody = z.object({ repo: z.string(), ref: z.string().nullish(), keepClone: z.boolean().optional() });
const listQuery = z.object({
  repo: z.string().optional(), status: z.enum(STATUSES).optional(), from: z.string().optional(), to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface ScanRouteDeps { repos: Repos; queue: Queue; egressLog: Pick<EgressLog, 'forScan' | 'summaryForScan'> }

export function registerScanRoutes(app: FastifyInstance, deps: ScanRouteDeps): void {
  const { repos, queue, egressLog } = deps;
  const withPos = (s: Scan): Scan => (s.status === 'queued' ? { ...s, queuePosition: queue.position(s.id) } : s);
  const need = (id: string): Scan => {
    const s = repos.scans.get(id);
    if (!s) throw new AppError('not_found', 404, 'Scan not found');
    return withPos(s);
  };

  app.post('/api/scans', async (req, reply) => {
    const body = createBody.safeParse(req.body ?? {});
    if (!body.success) throw new AppError('bad_request', 400, 'Invalid request body');
    const parsed = parseRepoInput({ repo: body.data.repo, ref: body.data.ref ?? null });
    if (!parsed.ok) throw new AppError(parsed.error.code, 400, parsed.error.message);
    const scan = queue.enqueue({ ...parsed.value, keepClone: body.data.keepClone ?? false });
    return reply.code(201).send(withPos(scan));
  });

  app.get('/api/scans', async (req) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) throw new AppError('bad_request', 400, 'Invalid query');
    const { page, pageSize, status, ...f } = q.data;
    const res = repos.scans.list({ ...f, ...(status ? { status: status as ScanStatus } : {}) }, page, pageSize);
    return { ...res, items: res.items.map(withPos) };
  });

  app.get('/api/queue', async () => queue.list());
  app.get<{ Params: { id: string } }>('/api/scans/:id', async (req) => need(req.params.id));

  app.post<{ Params: { id: string } }>('/api/scans/:id/cancel', async (req) => {
    need(req.params.id);
    return queue.cancel(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/scans/:id/rescan', async (req, reply) => {
    need(req.params.id);
    return reply.code(201).send(withPos(queue.rescan(req.params.id)));
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/scans/:id/logs', async (req) => {
    need(req.params.id);
    const after = Number(req.query.after ?? 0);
    return { items: repos.logs.list(req.params.id, Number.isFinite(after) && after > 0 ? Math.floor(after) : 0) };
  });

  app.get<{ Params: { id: string } }>('/api/scans/:id/outbound', async (req) => {
    const scan = need(req.params.id);
    const sessions = repos.claudeSessions.listByScan(scan.id);
    const reads = repos.outbound.listByScan(scan.id);
    const sum = repos.outbound.summary(scan.id);
    const eg = egressLog.summaryForScan(scan.id);
    const events = egressLog.forScan(scan.id);
    const byFile = new Map<string, { path: string; bytes: number; reads: number }>();
    for (const r of reads) {
      if (!r.path) continue;
      const e = byFile.get(r.path) ?? { path: r.path, bytes: 0, reads: 0 };
      e.bytes += r.bytes; e.reads++; byFile.set(r.path, e);
    }
    const anth = eg.destinations.filter((d) => d.host.endsWith('anthropic.com'));
    return {
      scanId: scan.id,
      sessions: sessions.map((s) => ({ id: s.id, pass: s.pass, batch: s.batch, model: s.model, promptBytes: s.promptBytes,
        prompt: redact(s.prompt, { repoContent: true }), usage: s.usage, status: s.status })),
      reads: reads.map((r) => ({ id: r.id, sessionId: r.sessionId, tool: r.tool, path: r.path, pattern: r.pattern,
        lines: r.lines ? String(r.lines) : null, bytes: r.bytes })),
      files: [...byFile.values()],
      anthropic: { connections: anth.reduce((n, d) => n + d.connections, 0), bytesUp: anth.reduce((n, d) => n + d.bytesUp, 0),
        bytesDown: anth.reduce((n, d) => n + d.bytesDown, 0) },
      github: events.filter((e) => e.host.endsWith('github.com') || e.purpose === 'github'),
      summary: { files: sum.files, bytesToClaude: sum.bytes, promptBytes: sessions.reduce((n, s) => n + s.promptBytes, 0),
        destinations: eg.destinations, blockedConnections: eg.blockedConnections },
    };
  });

  app.get<{ Params: { id: string; readId: string } }>('/api/scans/:id/outbound/reads/:readId', async (req) => {
    need(req.params.id);
    const r = repos.outbound.listByScan(req.params.id).find((x) => x.id === req.params.readId);
    if (!r) throw new AppError('not_found', 404, 'Read not found');
    return { id: r.id, path: r.path, bytes: r.bytes, excerpt: r.excerpt ?? '' };
  });
}
