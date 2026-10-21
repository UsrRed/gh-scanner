import type { FastifyInstance } from 'fastify';
import type { EgressFilter, EgressLog } from '../../egress-log/index.js';
import { AppError } from '../errors.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const int = (v: unknown, d: number, max: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : d;
};

function filterOf(q: Record<string, unknown>): EgressFilter {
  const f: EgressFilter = {};
  const host = str(q.host), purpose = str(q.purpose), scanId = str(q.scanId), from = str(q.from), to = str(q.to);
  if (host) f.host = host;
  if (purpose) f.purpose = purpose;
  if (scanId) f.scanId = scanId;
  if (from) f.from = from;
  if (to) f.to = to;
  if (q.blocked !== undefined && q.blocked !== '') {
    if (q.blocked !== 'true' && q.blocked !== 'false') throw new AppError('bad_request', 400, 'blocked must be true or false');
    f.blocked = q.blocked === 'true';
  }
  return f;
}

export function registerEgressRoutes(app: FastifyInstance, deps: { egressLog: EgressLog }): void {
  const { egressLog } = deps;
  const list = async (req: { query: unknown }) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    return egressLog.list(filterOf(q), int(q.page, 1, 1_000_000), int(q.pageSize, 50, 200));
  };
  app.get('/api/egress', list);
  app.get('/api/egress/events', list);
  app.get('/api/egress/totals', async (req) => ({ destinations: egressLog.totals(filterOf((req.query ?? {}) as Record<string, unknown>)) }));
  app.get('/api/egress/alerts', async () => egressLog.alertState());
  const ack = async () => egressLog.ack();
  app.post('/api/egress/ack', ack);
  app.post('/api/egress/alerts/ack', ack);
}
