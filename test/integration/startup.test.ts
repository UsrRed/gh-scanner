import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Agent } from 'undici';
import { startTestApp } from '../helpers/start-test-app.js';

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });

// The app's global dispatcher is the egress proxy: local calls need a direct agent.
const direct = new Agent();
const get = (u: string) => fetch(u, { dispatcher: direct } as RequestInit);

describe('startup', () => {
  it('refuses a non-loopback host without password', () => {
    const r = spawnSync('npx', ['tsx', 'server/index.ts'], {
      env: { PATH: process.env.PATH ?? '', SCANNER_HOST: '0.0.0.0', SCANNER_DATA_DIR: '/tmp/gh-scanner-noop' }, encoding: 'utf8', timeout: 30000,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/SCANNER_ADMIN_PASSWORD/);
  });

  it('serves /api/health on 127.0.0.1 and the SPA fallback', async () => {
    const t = await startTestApp(); cleanup = t.cleanup;
    const r = await get(`${t.url}/api/health`);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    const nf = await get(`${t.url}/api/nope`);
    expect(nf.status).toBe(404);
    expect((await nf.json()).error.code).toBe('not_found');
    const spa = await get(`${t.url}/scans/abc`);
    expect([200, 404]).toContain(spa.status);
  });

  it('routes outbound fetches of the app through the embedded proxy', async () => {
    const t = await startTestApp(); cleanup = t.cleanup;
    await expect(fetch('https://not-allowed.example/')).rejects.toThrow();
    const res = await get(`${t.url}/api/egress/events?blocked=true`);
    const page = await res.json() as { items: { host: string; purpose: string; blocked: boolean }[] };
    expect(page.items.some((e) => e.host === 'not-allowed.example' && e.purpose === 'app' && e.blocked)).toBe(true);
  });
});
