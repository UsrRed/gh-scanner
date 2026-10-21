import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../server/config/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { initClaudeRunner } from '../../server/claude-runner/index.js';
import { createSettingsClaude } from '../../server/settings-claude/index.js';
import type { PtyHandle, PtyExitReason } from '../../server/claude-runner/pty.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterEach(() => { vi.useRealTimers(); td.cleanup(); });

function setup(scenario: Record<string, unknown> = {}, spawnPty?: () => PtyHandle, bin = path.resolve('test/fixtures/fake-claude.mjs')) {
  const data = td.make();
  mkdirSync(path.join(data, 'claude-home'), { recursive: true });
  writeFileSync(path.join(data, 'claude-home', '.fake-claude.json'), JSON.stringify({ connect: false, ...scenario }));
  const config = loadConfig({ SCANNER_DATA_DIR: data, SCANNER_WORK_DIR: path.join(data, 'work'), SCANNER_CLAUDE_BIN: bin });
  initRedaction({ dataDir: data, workDir: path.join(data, 'work'), hostname: 'h', username: 'u' });
  initClaudeRunner(config);
  return { data, s: createSettingsClaude(config, { spawnPty }) };
}

describe('settings-claude', () => {
  it('status exposes only the last 4 chars; secrets.json is 600; delete clears', () => {
    const { data, s } = setup();
    expect(s.status()).toMatchObject({ mode: 'none', apiKeyHint: null });
    const st = s.setApiKey('sk-ant-api03-SECRETVALUE1234');
    expect(st.apiKeyHint).toBe('sk-ant-…1234');
    expect(JSON.stringify(st)).not.toContain('SECRETVALUE');
    expect(statSync(path.join(data, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(() => s.setApiKey('bad')).toThrow();
    expect(s.deleteApiKey().apiKeyHint).toBeNull();
  });

  it('verify: operational / not authenticated / masked error', async () => {
    expect(await setup({ scenario: 'success' }).s.verify()).toBe('opérationnel');
    expect(await setup({ loggedIn: false }).s.verify()).toBe('non authentifié');
    const { data, s } = setup({}, undefined, path.join(tmpdir(), 'no-such-claude-bin'));
    const r = await s.verify();
    expect(r).not.toBe('opérationnel');
    expect(r).not.toContain(data);
    expect(s.status().lastCheck?.state).toBe('error');
  });

  it('console closes automatically once credentials appear, and on timeout', () => {
    vi.useFakeTimers();
    const mk = () => {
      const exits: ((r: PtyExitReason) => void)[] = [];
      const pty = { id: 'c1', onData: () => undefined, write: () => undefined, resize: () => undefined,
        onExit: (cb: (r: PtyExitReason) => void) => { exits.push(cb); }, close: vi.fn(() => exits.forEach((e) => e('closed'))) };
      return pty;
    };
    const pty = mk();
    const { data, s } = setup({}, () => pty as unknown as PtyHandle);
    const { consoleId } = s.openConsole();
    expect(s.getConsole(consoleId)).toBe(pty);
    expect(() => s.openConsole()).toThrow();
    vi.advanceTimersByTime(3000);
    expect(pty.close).not.toHaveBeenCalled();
    mkdirSync(path.join(data, 'claude-home', '.claude'), { recursive: true });
    writeFileSync(path.join(data, 'claude-home', '.claude', '.credentials.json'), '{}');
    vi.advanceTimersByTime(1500);
    expect(pty.close).toHaveBeenCalledTimes(1);
    expect(s.getConsole(consoleId)).toBeNull();

    const pty2 = mk();
    const t = setup({}, () => pty2 as unknown as PtyHandle);
    t.s.openConsole();
    vi.advanceTimersByTime(15 * 60_000 + 10);
    expect(pty2.close).toHaveBeenCalled();
    expect(t.s.getConsole('c1')).toBeNull();
  });
});
