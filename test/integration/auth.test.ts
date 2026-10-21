import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { openDb } from '../../server/db/index.js';
import { registerAuth } from '../../server/auth/index.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterEach(() => td.cleanup());

async function setup(password?: string) {
  const dir = td.make();
  const config = loadConfig({ SCANNER_DATA_DIR: dir, SCANNER_WORK_DIR: path.join(dir, 'work'), ...(password ? { SCANNER_ADMIN_PASSWORD: password } : {}) });
  const db = openDb(path.join(dir, 'scanner.db'));
  const app = Fastify();
  await registerAuth(app, { db, config });
  app.get('/api/things', async () => ({ ok: true }));
  app.post('/api/things', async () => ({ ok: true }));
  await app.ready();
  const login = (pw: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: pw } });
  return { app, dir, login };
}

describe('auth', () => {
  it('login sets HttpOnly SameSite=Strict cookie and creates auth.json 600', async () => {
    const { app, dir, login } = await setup('hunter2');
    expect(statSync(path.join(dir, 'auth.json')).mode & 0o777).toBe(0o600);
    const r = await login('hunter2');
    expect(r.statusCode).toBe(204);
    const c = String(r.headers['set-cookie']);
    expect(c).toMatch(/gsid=/); expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/SameSite=Strict/);
    expect(c).not.toMatch(/Secure/);
    await app.close();
  });

  it('401 without cookie, 403 without CSRF, ok with both, me gives token', async () => {
    const { app, login } = await setup('pw');
    expect((await app.inject({ url: '/api/things' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(404); // not guarded
    const cookie = String((await login('pw')).cookies[0]!.value);
    const headers = { cookie: `gsid=${cookie}` };
    expect((await app.inject({ url: '/api/things', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/things', headers })).statusCode).toBe(403);
    const me = (await app.inject({ url: '/api/auth/me', headers })).json();
    expect(me.authenticated).toBe(true);
    const ok = await app.inject({ method: 'POST', url: '/api/things', headers: { ...headers, 'x-csrf-token': me.csrfToken } });
    expect(ok.statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...headers, 'x-csrf-token': me.csrfToken } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/things', headers })).statusCode).toBe(401);
    await app.close();
  });

  it('6th failure within 15 min returns 429', async () => {
    const { app, login } = await setup('pw');
    for (let i = 0; i < 5; i++) expect((await login('bad')).statusCode).toBe(401);
    expect((await login('bad')).statusCode).toBe(429);
    expect((await login('pw')).statusCode).toBe(429);
    await app.close();
  });

  it('open access locally without password', async () => {
    const { app, dir } = await setup();
    expect((await app.inject({ method: 'POST', url: '/api/things' })).statusCode).toBe(200);
    const me = (await app.inject({ url: '/api/auth/me' })).json();
    expect(me).toEqual({ authRequired: false, authenticated: true, csrfToken: null });
    expect(() => statSync(path.join(dir, 'auth.json'))).toThrow();
    await app.close();
  });
});
