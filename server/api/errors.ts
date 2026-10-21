export type ErrorCode = 'bad_request' | 'invalid_repo' | 'invalid_ref' | 'unauthorized' | 'forbidden' | 'csrf' | 'rate_limited'
  | 'not_found' | 'conflict' | 'scan_not_cancellable' | 'repo_mismatch' | 'flow_in_progress' | 'internal';

export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number, message: string) { super(message); }
}

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { redact } from '../redact/index.js';
import { log } from '../log.js';

const GENERIC: Record<number, string> = { 400: 'Bad request', 404: 'Not found', 413: 'Payload too large', 415: 'Unsupported media type' };

/** Uniform `{ error: { code, message } }` for every failure; internal errors never leak message or stack. */
export function registerErrorHandling(app: FastifyInstance, opts: { notFound?: (req: FastifyRequest, reply: FastifyReply) => unknown } = {}): void {
  app.setErrorHandler((err: FastifyError | AppError, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: redact(err.message) } });
    }
    const status = (err as FastifyError).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: GENERIC[status] ?? 'Bad request' } });
    }
    log.error(`internal error ${req.method} ${req.url.split('?')[0]}`, err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Internal server error' } });
  });
  app.setNotFoundHandler((req, reply) => opts.notFound?.(req, reply) ?? reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } }));
}
