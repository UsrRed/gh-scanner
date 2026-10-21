import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertStartupAllowed, authRequired, loadConfig } from '../../server/config/index.js';
import { appRoot } from '../../server/paths.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      host: '127.0.0.1', port: 8417, dataDir: path.join(appRoot(), 'data'), workDir: path.join(appRoot(), 'data', 'work'), concurrency: 1, maxRepoMb: 200,
      cloneTimeoutS: 120, sessionTimeoutS: 900, budgetUsd: 2, budgetTokens: 1500000, maxTurns: 60,
      modelAnalysis: 'claude-sonnet-5-5', modelSynthesis: 'claude-opus-5-5', modelPing: 'claude-haiku-5-5',
      keepClones: false, claudeBin: 'claude', ghBin: 'gh', gitBin: 'git', egressPort: 3128,
      egressSharedDir: path.join(appRoot(), 'data', 'egress'), egressAppUrl: 'http://app:8417', cookieSecure: false,
    });
    expect(c.egressAllowlist).toContainEqual({ host: 'api.anthropic.com', port: 443 });
    expect(c.egressAllowlist.some((e) => e.host === 'statsig.anthropic.com')).toBe(false);
  });
  it('parses overrides', () => {
    const c = loadConfig({ SCANNER_DATA_DIR: '/x', SCANNER_KEEP_CLONES: '1', EGRESS_ALLOWLIST: 'a.test:8443,b.test',
      EGRESS_HOST_OVERRIDES: 'a.test:8443=127.0.0.1:9' });
    expect(c.workDir).toBe('/x/work');
    expect(c.keepClones).toBe(true);
    expect(c.egressAllowlist).toEqual([{ host: 'a.test', port: 8443 }, { host: 'b.test', port: 443 }]);
    expect(c.egressHostOverrides).toEqual({ 'a.test:8443': '127.0.0.1:9' });
  });
  it('rejects invalid values', () => {
    expect(() => loadConfig({ SCANNER_CONCURRENCY: '0' })).toThrow(/SCANNER_CONCURRENCY/);
    expect(() => loadConfig({ SCANNER_PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ SCANNER_KEEP_CLONES: 'maybe' })).toThrow();
  });
});

describe('assertStartupAllowed', () => {
  it('requires a password off loopback', () => {
    expect(() => assertStartupAllowed(loadConfig({ SCANNER_HOST: '0.0.0.0' }))).toThrow(/SCANNER_ADMIN_PASSWORD/);
    expect(() => assertStartupAllowed(loadConfig({ SCANNER_HOST: '0.0.0.0', SCANNER_ADMIN_PASSWORD: 'pw' }))).not.toThrow();
    expect(() => assertStartupAllowed(loadConfig({ SCANNER_HOST: '0.0.0.0', SCANNER_CONTAINER_LOCAL: '1' }))).not.toThrow();
    expect(() => assertStartupAllowed(loadConfig({}))).not.toThrow();
  });
  it('authRequired', () => {
    expect(authRequired(loadConfig({}))).toBe(false);
    expect(authRequired(loadConfig({ SCANNER_ADMIN_PASSWORD: 'x' }))).toBe(true);
  });
});

it('appRoot finds package.json', () => expect(appRoot()).toMatch(/gh-scanner$/));
