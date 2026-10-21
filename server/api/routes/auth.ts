import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/index.js';
import type { Db } from '../../db/index.js';
import { sendError, type AuthState } from '../../auth/index.js';
import { isBlocked, recordFailure } from '../../auth/rate-limit.js';
import { verifyPassword } from '../../auth/password.js';
import { COOKIE_NAME, cookieOptions, createSession, destroySession } from '../../auth/sessions.js';

export function registerAuthRoutes(app: FastifyInstance, deps: { db: Db; config: Config; state: AuthState }): void {
  const { db, config, state } = deps;

  app.get('/api/auth/me', async (req) => ({
    authRequired: state.enabled,
    authenticated: !state.enabled || !!req.authSession,
    csrfToken: state.enabled ? (req.authSession?.csrf ?? null) : null,
  }));

  app.post('/api/auth/login', async (req, reply) => {
    if (!state.enabled || !state.hash) return reply.code(204).send();
    if (isBlocked(db, req.ip)) return sendError(reply, 429, 'rate_limited', 'Too many failed attempts, retry later');
    const pw = (req.body as { password?: unknown } | null)?.password;
    if (typeof pw !== 'string' || !(await verifyPassword(pw, state.hash))) {
      recordFailure(db, req.ip);
      return sendError(reply, 401, 'unauthorized', 'Invalid password');
    }
    const { token } = createSession(db);
    return reply.setCookie(COOKIE_NAME, token, cookieOptions(config.cookieSecure)).code(204).send();
  });

  // Logout is a mutation: the global hook already enforced session + CSRF.
  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(db, req.cookies[COOKIE_NAME]);
    return reply.clearCookie(COOKIE_NAME, { path: '/' }).code(204).send();
  });
}
