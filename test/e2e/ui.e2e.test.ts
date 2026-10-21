import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { build } from 'vite';
import { makeVulnRepo } from '../fixtures/make-vuln-repo.js';
import { startTestApp } from '../helpers/start-test-app.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';
import { waitFor } from '../helpers/wait-for-status.js';

const td = tmpDirs();
const shots = path.resolve('docs/qa/screenshots');
const MAPPING = { languages: ['js'], entryPoints: [], manifests: ['package.json'], lockfiles: [], ciWorkflows: [], installScripts: ['package.json'],
  riskZones: [{ path: 'src/config.js', reason: 'secrets', categories: ['secrets'] }] };
const SYNTHESIS = { verdict: 'do-not-install', justification: 'Secret and postinstall risks.', keyRisks: ['secret'] };

/** Any installed headless chromium (the cached revision may differ from the one playwright-core expects). */
function findChromium(): string | undefined {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const d of readdirSync(cache).filter((n) => n.startsWith('chromium')).sort().reverse()) {
    for (const sub of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(cache, d, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

let app: Awaited<ReturnType<typeof startTestApp>>;
let browser: Browser;
let page: Page;
const consoleErrors: string[] = [];
const failedRequests: string[] = [];

beforeAll(async () => {
  if (!existsSync(path.resolve('dist/web/index.html'))) await build({ configFile: path.resolve('vite.config.ts'), logLevel: 'error' });
  const root = td.make();
  const fixture = makeVulnRepo(path.join(root, 'fixture'));
  app = await startTestApp();
  mkdirSync(path.join(app.dataDir, 'gh'), { recursive: true });
  mkdirSync(path.join(app.dataDir, 'claude-home'), { recursive: true });
  writeFileSync(path.join(app.dataDir, 'gh', '.fake-gh.json'), JSON.stringify({ fixtureDir: fixture, originUrl: fixture }));
  writeFileSync(path.join(app.dataDir, 'claude-home', '.fake-claude.json'),
    JSON.stringify({ outputs: { mapping: MAPPING, targeted: { findings: [] }, synthesis: SYNTHESIS } }));
  mkdirSync(shots, { recursive: true });
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 500) failedRequests.push(`${r.url()} ${r.status()}`); });
}, 60000);

afterAll(async () => {
  await browser?.close();
  await app?.cleanup();
  td.cleanup();
});

describe('UI e2e (real browser)', () => {
  it('shows a clear error for an invalid repository input', async () => {
    await page.goto(app.url + '/');
    await page.fill('#repo', 'https://gitlab.com/o/r');
    await page.click('button[type=submit]');
    const err = page.locator('#repo-err');
    await err.waitFor({ timeout: 5000 });
    expect(await err.textContent()).toContain('invalid_repo');
    expect(await page.locator('#repo').getAttribute('aria-invalid')).toBe('true');
    expect(await page.locator('body').innerText()).not.toMatch(/at \w+.*\.(ts|js):\d+|stack/i);
    await page.fill('#repo', 'o/r');
    await page.fill('#ref', '--upload-pack=x');
    await page.click('button[type=submit]');
    await page.locator('#ref-err').waitFor({ timeout: 5000 });
    await page.screenshot({ path: path.join(shots, 'error-state.png'), fullPage: true });
  });

  it('runs the happy path: scan, live follow, report', async () => {
    consoleErrors.length = 0; failedRequests.length = 0; // the 400 from the invalid-input test is expected
    await page.goto(app.url + '/');
    await page.fill('#repo', 'o/r');
    await page.fill('#ref', '');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/scans\/[^/]+/, { timeout: 10000 });
    const id = /\/scans\/([^/?#]+)/.exec(page.url())![1]!;
    await waitFor(async () => ((await (await page.request.get(`${app.url}/api/scans/${id}`)).json()) as { status: string }).status, (v) => v === 'done', 30000, 100);
    await page.goto(`${app.url}/scans/${id}/report`);
    await page.locator('.verdict').waitFor({ timeout: 10000 });
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/pull_request_target|postinstall/i);
    await page.goto(app.url + '/history');
    await page.getByText('o/r').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: path.join(shots, 'happy-path.png'), fullPage: true });
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  }, 60000);
});
