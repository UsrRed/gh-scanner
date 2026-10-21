import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config/index.js';
import type { Db } from '../db/index.js';
import { registerAuthRoutes } from '../api/routes/auth.js';
import { CSRF_HEADER, csrfValid, isMutation } from './csrf.js';
import { ensureAuthFile } from './password.js';
import { COOKIE_NAME, getSession, type ActiveSession } from './sessions.js';

export { hashPassword, verifyPassword } from './password.js';

export interface AuthState { enabled: boolean; hash: string | null }

declare module 'fastify' {
  interface FastifyRequest { authSession?: ActiveSession | null }
}

// Routes reachable without a session (own protection or public by design).
const PUBLIC = new Set(['/api/health', '/api/auth/login', '/api/auth/me']);

export function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

function guarded(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (PUBLIC.has(path) || path.startsWith('/internal/')) return false;
  return path.startsWith('/api/') || path === '/ws' || path.startsWith('/ws/');
}

export async function registerAuth(app: FastifyInstance, deps: { db: Db; config: Config }): Promise<void> {
  const { db, config } = deps;
  const state: AuthState = { enabled: config.adminPassword !== undefined, hash: null };
  if (config.adminPassword !== undefined) state.hash = await ensureAuthFile(config.dataDir, config.adminPassword);

  await app.register(fastifyCookie);

  // Covers HTTP and WebSocket upgrades (same cookie, same hook).
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!state.enabled) return;
    req.authSession = getSession(db, req.cookies[COOKIE_NAME]);
    if (!guarded(req.url)) return;
    if (!req.authSession) return sendError(reply, 401, 'unauthorized', 'Authentication required');
    if (isMutation(req.method) && !csrfValid(req.authSession.csrf, req.headers[CSRF_HEADER])) {
      return sendError(reply, 403, 'csrf', 'Missing or invalid CSRF token');
    }
  });

  registerAuthRoutes(app, { db, config, state });
}
