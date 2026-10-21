import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { loadConfig } from '../../server/config/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { buildClaudeArgs, writeSandboxFiles } from '../../server/claude-runner/args.js';
import { checkToolUse } from '../../server/claude-runner/sandbox-guard.js';
import { parseStreamLine } from '../../server/claude-runner/stream.js';
import { initClaudeRunner, runClaudeSession, runStructured, pingClaude, ClaudeRunnerError, type RunnerEvent } from '../../server/claude-runner/index.js';
import { buildEnv } from '../../server/env-builder/index.js';

const FAKE = path.resolve('test/fixtures/fake-claude.mjs');
let data: string, clone: string;

function setup(sc: object, extra: Record<string, string> = {}) {
  data = mkdtempSync(path.join(tmpdir(), 'cr-'));
  clone = path.join(data, 'work', 's1', 'x');
  mkdirSync(clone, { recursive: true });
  writeFileSync(path.join(clone, 'README.md'), '# hi');
  mkdirSync(path.join(data, 'claude-home'), { recursive: true });
  writeFileSync(path.join(data, 'claude-home', '.fake-claude.json'), JSON.stringify({ connect: false, ...sc }));
  const config = loadConfig({ SCANNER_DATA_DIR: data, SCANNER_WORK_DIR: path.join(data, 'work'), SCANNER_CLAUDE_BIN: FAKE, ...extra });
  initRedaction({ dataDir: data, workDir: path.join(data, 'work'), hostname: 'h', username: 'u' });
  initClaudeRunner(config);
}
const budget = { add: () => undefined, exceeded: false };
const opts = (events: RunnerEvent[] = []) => ({ scanId: 's1', pass: 'targeted' as const, batch: null, model: 'm', cwd: clone,
  systemPrompt: 'sys', prompt: 'PASS: targeted', budget, signal: new AbortController().signal, onEvent: (e: RunnerEvent) => { events.push(e); } });

describe('args', () => {
  it('has exactly the imposed flags and never Bash as allowed', () => {
    const { settingsFile, mcpFile } = writeSandboxFiles(mkdtempSync(path.join(tmpdir(), 'cr-')));
    const a = buildClaudeArgs({ model: 'm', systemPrompt: 'S', maxTurns: 7, settingsFile, mcpFile });
    expect(a).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--model', 'm',
      '--allowedTools', 'Read,Grep,Glob', '--disallowedTools', 'Bash,Write,Edit,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task',
      '--strict-mcp-config', '--mcp-config', mcpFile, '--settings', settingsFile, '--append-system-prompt', 'S', '--max-turns', '7']);
    expect(a[a.indexOf('--allowedTools') + 1]).not.toContain('Bash');
    expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual({ mcpServers: {} });
  });
});

describe('sandbox-guard', () => {
  it('allows inside, rejects outside, symlink escape and other tools', () => {
    setup({});
    symlinkSync('/etc', path.join(clone, 'link'));
    expect(checkToolUse(clone, 'Read', { file_path: path.join(clone, 'README.md') }).ok).toBe(true);
    expect(checkToolUse(clone, 'Read', { file_path: 'README.md' }).ok).toBe(true);
    expect(checkToolUse(clone, 'Glob', { pattern: '**/*' }).ok).toBe(true);
    expect(checkToolUse(clone, 'Read', { file_path: '/etc/passwd' }).ok).toBe(false);
    expect(checkToolUse(clone, 'Read', { file_path: 'link/passwd' }).ok).toBe(false);
    expect(checkToolUse(clone, 'Read', { file_path: '../../y' }).ok).toBe(false);
    expect(checkToolUse(clone, 'Grep', { pattern: 'a', path: '/' }).ok).toBe(false);
    expect(checkToolUse(clone, 'Glob', { pattern: '../**' }).ok).toBe(false);
    expect(checkToolUse(clone, 'Bash', { command: 'ls' }).ok).toBe(false);
  });
});

describe('stream', () => {
  it('tool_result carries size and redacted excerpt; garbage tolerated', () => {
    setup({});
    expect(parseStreamLine('not json')).toEqual([]);
    const line = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'tok ghp_abcdefghijklmnopqrstuvwxyz0123456789 end' }] } });
    const [it] = parseStreamLine(line);
    expect(it).toMatchObject({ kind: 'tool_result', bytes: 48 });
    expect((it as { excerpt: string }).excerpt).toContain('[REDACTED:');
    expect((it as { excerpt: string }).excerpt).not.toContain('ghp_abc');
  });
});

describe('sessions (fake CLI)', () => {
  beforeEach(() => setup({}));
  it('success emits events and usage', async () => {
    const ev: RunnerEvent[] = [];
    const r = await runClaudeSession(opts(ev));
    expect(r.sessionId).toBe('fake-session');
    expect(r.usage.costUsd).toBeGreaterThan(0);
    expect(ev.filter((e) => e.type === 'tool_use').length).toBe(2);
    const tr = ev.find((e) => e.type === 'tool_result');
    expect(tr).toMatchObject({ bytes: expect.any(Number), excerpt: expect.any(String) });
    expect(ev.some((e) => e.type === 'usage')).toBe(true);
  });
  it('Bash tool => killed + violation', async () => {
    setup({ scenario: 'forbidden-tool' });
    const err = await runClaudeSession(opts()).catch((e) => e);
    expect(err).toBeInstanceOf(ClaudeRunnerError);
    expect(err.kind).toBe('sandbox_violation');
    expect(err.violation.tool).toBe('Bash');
  });
  it('Read outside clone => killed + violation', async () => {
    setup({ scenario: 'outside-path' });
    const err = await runClaudeSession(opts()).catch((e) => e);
    expect(err.kind).toBe('sandbox_violation');
    expect(err.violation.path).toBe('/etc/passwd');
  });
  it('invalid JSON => one retry then explicit error', async () => {
    setup({ scenario: 'invalid-json' });
    let n = 0;
    const o = opts(); const orig = o.onEvent;
    o.onEvent = (e) => { if (e.type === 'tool_use' && e.id === 't1') n++; orig(e); };
    const err = await runStructured(o, z.object({ findings: z.array(z.any()) })).catch((e) => e);
    expect(err.kind).toBe('invalid_output');
    expect(n).toBe(2);
  });
  it('valid JSON is parsed', async () => {
    setup({ outputs: { targeted: { findings: [] } } });
    const r = await runStructured(opts(), z.object({ findings: z.array(z.any()) }));
    expect(r.data.findings).toEqual([]);
  });
  it('budget exceeded kills session', async () => {
    setup({});
    const b = { add: () => undefined, get exceeded() { return true; } };
    const err = await runClaudeSession({ ...opts(), budget: b }).catch((e) => e);
    expect(err.kind).toBe('budget_exceeded');
  });
});

describe('error classification', () => {
  const script = (body: string) => { const f = path.join(mkdtempSync(path.join(tmpdir(), 'cs-')), 'c.mjs'); writeFileSync(f, body); return f; };
  it('distinct messages for missing / unauthenticated / quota / timeout', async () => {
    setup({}, { SCANNER_CLAUDE_BIN: '/nonexistent/claude-bin' });
    const missing = await runClaudeSession(opts()).catch((e) => e);
    setup({ loggedIn: false });
    const ping = await pingClaude();
    const unauth = await runClaudeSession({ ...opts(), prompt: 'ping' }).catch((e) => e);
    setup({}, { SCANNER_CLAUDE_BIN: script(`process.stdout.write(JSON.stringify({type:'result',is_error:true,result:'Claude usage limit reached',usage:{}})+'\\n');process.exit(1)`) });
    const quota = await runClaudeSession(opts()).catch((e) => e);
    setup({}, { SCANNER_CLAUDE_BIN: script(`setTimeout(()=>{},60000)`), SCANNER_SESSION_TIMEOUT_S: '1' });
    const timeout = await runClaudeSession(opts()).catch((e) => e);
    expect([missing.kind, unauth.kind, quota.kind, timeout.kind]).toEqual(['cli_missing', 'not_authenticated', 'quota', 'timeout']);
    expect(ping.state).toBe('not_authenticated');
    expect(new Set([missing, unauth, quota, timeout].map((e) => e.userMessage)).size).toBe(4);
  });
  it('ping ok with logged-in fake', async () => {
    setup({});
    expect((await pingClaude()).state).toBe('ok');
  });
});

describe('subprocess env', () => {
  it('has no HOST_SECRET', () => {
    process.env.HOST_SECRET = 'trap-value';
    setup({});
    const e = buildEnv('claude', { purpose: 'p', config: loadConfig({ SCANNER_DATA_DIR: data }) });
    expect(JSON.stringify(e)).not.toContain('trap-value');
    delete process.env.HOST_SECRET;
  });
});
