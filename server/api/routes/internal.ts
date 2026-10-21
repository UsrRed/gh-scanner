import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EgressEvent } from '../../../shared/types.js';
import type { EgressLog } from '../../egress-log/index.js';
import { AppError } from '../errors.js';

const eventSchema = z.object({
  id: z.string().min(1), startedAt: z.string(), endedAt: z.string(), host: z.string(), port: z.number().int(),
  bytesUp: z.number(), bytesDown: z.number(), durationMs: z.number(),
  status: z.enum(['ok', 'blocked', 'error']), httpStatus: z.number().int(), blocked: z.boolean(),
  purpose: z.string(), scanId: z.string().nullable(), error: z.string().nullable(),
});
const bodySchema = z.object({ events: z.array(eventSchema).max(1000) });

function secretMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Egress → app event ingestion, authenticated by the shared secret (outside the cookie auth). */
export function registerInternalRoutes(app: FastifyInstance, deps: { egressLog: Pick<EgressLog, 'ingest'>; secret: string }): void {
  app.post('/internal/egress/events', async (req, reply) => {
    if (!secretMatches(deps.secret, req.headers['x-egress-secret'])) throw new AppError('unauthorized', 401, 'Invalid egress secret');
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('bad_request', 400, 'Invalid events payload');
    deps.egressLog.ingest(parsed.data.events as EgressEvent[]);
    return reply.code(204).send();
  });
}
