import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import type { Usage } from '../../shared/types.js';
import { buildSubprocessEnv } from '../env-builder/index.js';
import { spawnTree, killTree } from '../proc/spawn.js';
import { redact } from '../redact/index.js';
import { buildClaudeArgs, writeSandboxFiles } from './args.js';
import { getConfig } from './config.js';
import { ClaudeRunnerError, classifyCliError, type SandboxViolation } from './errors.js';
import { checkToolUse } from './sandbox-guard.js';
import { parseStreamLine } from './stream.js';
import type { BudgetLike, ClaudeSessionOptions, ClaudeSessionResult, RunnerEvent } from './types.js';

export { initClaudeRunner } from './config.js';
export { ClaudeRunnerError } from './errors.js';
export { checkToolUse } from './sandbox-guard.js';
export { spawnLoginPty } from './pty.js';
export type { PtyHandle } from './pty.js';
export type { ClaudeSessionOptions, ClaudeSessionResult, RunnerEvent, ClaudeErrorKind } from './types.js';

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
const NO_BUDGET: BudgetLike = { add: () => undefined, exceeded: false };

interface CoreOptions {
  purpose: string; model: string; cwd: string; systemPrompt: string; prompt: string; maxTurns: number;
  budget: BudgetLike; signal?: AbortSignal; onEvent(e: RunnerEvent): void;
}

async function runCore(o: CoreOptions): Promise<ClaudeSessionResult> {
  const config = getConfig();
  const claudeHome = path.join(config.dataDir, 'claude-home');
  const { settingsFile, mcpFile } = writeSandboxFiles(claudeHome);
  mkdirSync(o.cwd, { recursive: true });
  const env = buildSubprocessEnv('claude', { purpose: o.purpose, config });
  const args = buildClaudeArgs({ model: o.model, systemPrompt: o.systemPrompt, maxTurns: o.maxTurns, settingsFile, mcpFile });
  const t = spawnTree(config.claudeBin, args, {
    cwd: o.cwd, env, stdin: o.prompt, timeoutMs: config.sessionTimeoutS * 1000, signal: o.signal,
  });

  let spawnError: NodeJS.ErrnoException | null = null;
  t.child.once('error', (e) => { spawnError = e; });
  let violation: SandboxViolation | null = null;
  let budgetHit = false;
  let sessionId = '';
  let text = '';
  let resultItem: { isError: boolean; text: string } | null = null;
  let usage: Usage = { ...ZERO };
  let reported: Usage = { ...ZERO };
  let stderr = '';
  let buf = '';

  const report = (u: Usage): void => {
    const delta: Usage = {
      inputTokens: u.inputTokens - reported.inputTokens, outputTokens: u.outputTokens - reported.outputTokens,
      cacheReadTokens: u.cacheReadTokens - reported.cacheReadTokens,
      cacheCreationTokens: u.cacheCreationTokens - reported.cacheCreationTokens, costUsd: u.costUsd - reported.costUsd,
    };
    reported = u; usage = u;
    o.budget.add(delta);
    o.onEvent({ type: 'usage', usage: u });
    if (o.budget.exceeded && !budgetHit && !violation) { budgetHit = true; void killTree(t.pid); }
  };

  const handle = (line: string): void => {
    if (violation) return;
    for (const it of parseStreamLine(line)) {
      if (it.kind === 'init') sessionId = it.sessionId;
      else if (it.kind === 'tool_use') {
        const check = checkToolUse(o.cwd, it.tool, it.input);
        if (!check.ok) {
          violation = { tool: it.tool, path: it.path, reason: redact(check.reason, { repoContent: true }) };
          void killTree(t.pid, 200);
          return;
        }
        o.onEvent({ type: 'tool_use', id: it.id, tool: it.tool, path: it.path, pattern: it.pattern, lines: it.lines });
      } else if (it.kind === 'tool_result') o.onEvent({ type: 'tool_result', toolUseId: it.toolUseId, bytes: it.bytes, excerpt: it.excerpt });
      else if (it.kind === 'text') text = it.text;
      else if (it.kind === 'usage') {
        report({ ...usage, inputTokens: usage.inputTokens + it.usage.inputTokens, outputTokens: usage.outputTokens + it.usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens + it.usage.cacheReadTokens, cacheCreationTokens: usage.cacheCreationTokens + it.usage.cacheCreationTokens });
      } else if (it.kind === 'result') {
        if (it.sessionId) sessionId = it.sessionId;
        resultItem = { isError: it.isError, text: it.text };
        if (it.text) text = it.text;
        report(it.usage);
      }
    }
  };

  t.child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  t.child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 8192) stderr += d.toString('utf8'); });

  const r = await t.done;
  if (buf) handle(buf);

  if (spawnError && (spawnError as NodeJS.ErrnoException).code === 'ENOENT') throw new ClaudeRunnerError('cli_missing', config.claudeBin);
  if (violation) throw new ClaudeRunnerError('sandbox_violation', (violation as SandboxViolation).reason, violation);
  if (o.signal?.aborted) throw new ClaudeRunnerError('cancelled');
  if (budgetHit) throw new ClaudeRunnerError('budget_exceeded');
  if (r.timedOut) throw new ClaudeRunnerError('timeout', `${config.sessionTimeoutS}s`);
  const res = resultItem as { isError: boolean; text: string } | null;
  if (res?.isError || r.code !== 0) {
    const msg = `${res?.text ?? ''}\n${stderr}`.trim();
    throw new ClaudeRunnerError(classifyCliError(msg), msg.slice(0, 500) || `exit ${r.code ?? r.signal}`);
  }
  if (!res) throw new ClaudeRunnerError('process_error', 'no result event');
  return { sessionId, text, usage, promptBytes: Buffer.byteLength(o.systemPrompt) + Buffer.byteLength(o.prompt) };
}

export function runClaudeSession(o: ClaudeSessionOptions): Promise<ClaudeSessionResult> {
  const config = getConfig();
  return runCore({
    purpose: `scan.${o.scanId}.claude.${o.pass}`, model: o.model, cwd: o.cwd, systemPrompt: o.systemPrompt,
    prompt: o.prompt, maxTurns: config.maxTurns, budget: o.budget, signal: o.signal, onEvent: o.onEvent,
  });
}

function extractJson(text: string): unknown {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (let m = fence.exec(text); m; m = fence.exec(text)) if (m[1]) candidates.push(m[1]);
  candidates.push(text);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  for (const c of candidates) {
    try { return JSON.parse(c.trim()); } catch { /* next */ }
  }
  throw new Error('no JSON found');
}

export async function runStructured<T>(o: ClaudeSessionOptions, schema: ZodType<T>): Promise<{ data: T; result: ClaudeSessionResult }> {
  let lastErr = '';
  let prompt = o.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runClaudeSession({ ...o, prompt });
    try {
      const parsed = schema.safeParse(extractJson(result.text));
      if (parsed.success) return { data: parsed.data, result };
      lastErr = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch (e) { lastErr = (e as Error).message; }
    prompt = `${o.prompt}\n\nYour previous answer was not valid JSON for the required schema (${lastErr}). Reply again with ONLY the valid JSON object.`;
  }
  throw new ClaudeRunnerError('invalid_output', lastErr);
}

export async function pingClaude(): Promise<{ state: 'ok' | 'not_authenticated' | 'error'; message: string }> {
  const config = getConfig();
  const cwd = path.join(config.dataDir, 'claude-home');
  try {
    await runCore({
      purpose: 'settings.claude-ping', model: config.modelPing, cwd, systemPrompt: 'Reply with the single word: pong.',
      prompt: 'ping', maxTurns: 1, budget: NO_BUDGET, onEvent: () => undefined,
    });
    return { state: 'ok', message: 'Claude répond.' };
  } catch (e) {
    if (e instanceof ClaudeRunnerError) return { state: e.kind === 'not_authenticated' ? 'not_authenticated' : 'error', message: e.userMessage };
    return { state: 'error', message: redact((e as Error).message) };
  }
}
