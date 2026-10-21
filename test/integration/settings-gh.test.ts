import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { createSettingsGh } from '../../server/settings-gh/index.js';
import { parseDeviceOutput } from '../../server/settings-gh/device-parse.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';
import { waitFor } from '../helpers/wait-for-status.js';

const td = tmpDirs();
afterEach(() => { vi.useRealTimers(); td.cleanup(); });

function setup(scenario: Record<string, unknown>, timeoutMs?: number) {
  const data = td.make();
  mkdirSync(path.join(data, 'gh'), { recursive: true });
  writeFileSync(path.join(data, 'gh', '.fake-gh.json'), JSON.stringify(scenario));
  const config = loadConfig({ SCANNER_DATA_DIR: data, SCANNER_WORK_DIR: path.join(data, 'work'), SCANNER_GH_BIN: path.resolve('test/fixtures/fake-gh.mjs') });
  return { data, s: createSettingsGh(config, { timeoutMs }) };
}

describe('settings-gh', () => {
  it('parses device output', () => {
    expect(parseDeviceOutput('! First copy your one-time code: abcd-1234\nOpen https://github.com/login/device')).toEqual({ userCode: 'ABCD-1234', url: 'https://github.com/login/device' });
    expect(parseDeviceOutput('nothing')).toEqual({ userCode: null, url: null });
  });

  it('exposes code and url then becomes connected; status has no token', async () => {
    const { s } = setup({ loggedIn: false });
    expect((await s.status()).connected).toBe(false);
    const f = s.startLogin();
    expect(() => s.startLogin()).toThrow();
    const pending = await waitFor(() => s.getFlow(f.id)!, (x) => x.state !== 'starting');
    expect(pending).toMatchObject({ state: 'pending', userCode: 'ABCD-1234', verificationUrl: 'https://github.com/login/device' });
    await waitFor(() => s.getFlow(f.id)!, (x) => x.state === 'connected');
    const st = await s.status();
    expect(st).toMatchObject({ connected: true, login: 'octocat' });
    expect(JSON.stringify(st)).not.toMatch(/gho_/);
    expect((await s.logout()).connected).toBe(false);
  });

  it('cancels a pending flow', async () => {
    const { s } = setup({ loggedIn: false, loginDelayMs: 60000 });
    const f = s.startLogin();
    await waitFor(() => s.getFlow(f.id)!, (x) => x.state === 'pending');
    expect((await s.cancelFlow(f.id))?.state).toBe('cancelled');
    expect(s.getFlow('other')).toBeNull();
    expect(() => s.startLogin()).not.toThrow();
    await s.cancelFlow();
  });

  it('expires after 15 minutes', async () => {
    const { s } = setup({ loggedIn: false, loginDelayMs: 60000 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const f = s.startLogin();
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(s.getFlow(f.id)?.state).toBe('expired');
  });

  it('fixes storage permissions', () => {
    const { data, s } = setup({});
    const gh = path.join(data, 'gh');
    chmodSync(gh, 0o755);
    const hosts = path.join(gh, 'hosts.yml');
    writeFileSync(hosts, 'x');
    chmodSync(hosts, 0o644);
    expect(s.verifyStoragePermissions().length).toBeGreaterThanOrEqual(2);
    expect(statSync(gh).mode & 0o777).toBe(0o700);
    expect(statSync(hosts).mode & 0o777).toBe(0o600);
  });
});
