import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ZodType } from 'zod';
import type { PassName, Usage } from '../../../shared/types.js';
import { ClaudeRunnerError, runStructured, type RunnerEvent } from '../../claude-runner/index.js';
import type { Repos } from '../../db/repos/index.js';
import type { BudgetTracker } from '../budget.js';
import { systemPrompt } from '../prompts.js';
import type { RawFinding } from '../types.js';

export interface PassEnv {
  scanId: string;
  cwd: string;
  repos: Repos;
  budget: BudgetTracker;
  budgetLimits: { usd: number; tokens: number };
  signal: AbortSignal;
  /** Findings produced by the pipeline itself (sandbox violations). */
  internal: RawFinding[];
  log(level: 'info' | 'warn' | 'error', msg: string): void;
  onUsage(pass: PassName, batch: string | null, usage: Usage): void;
}

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };

/** Counts "10-20" as 11 lines, "5" as 5, anything else as 0. */
function lineCount(lines: string | null): number {
  if (!lines) return 0;
  const r = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(lines);
  if (r) return Math.max(0, Number(r[2]) - Number(r[1]) + 1);
  return /^\s*\d+\s*$/.test(lines) ? Number(lines) : 0;
}

/** Runs one structured Claude session, persisting claude_sessions and outbound_reads. */
export async function runPassSession<T>(env: PassEnv, o: { pass: PassName; batch: string | null; model: string; prompt: string; schema: ZodType<T> }): Promise<T> {
  if (env.signal.aborted) throw new ClaudeRunnerError('cancelled');
  if (env.budget.exceeded) throw new ClaudeRunnerError('budget_exceeded');
  const sessionId = randomUUID();
  const system = systemPrompt();
  const promptBytes = Buffer.byteLength(system) + Buffer.byteLength(o.prompt);
  env.repos.claudeSessions.insert({ id: sessionId, scanId: env.scanId, pass: o.pass, batch: o.batch, model: o.model, prompt: o.prompt,
    promptBytes, usage: ZERO, status: 'running', startedAt: new Date().toISOString(), endedAt: null });

  let used: Usage = { ...ZERO };
  const pending = new Map<string, { tool: string; path: string | null; pattern: string | null; lines: string | null }>();
  const rel = (p: string | null): string | null => (p && path.isAbsolute(p) ? (path.relative(env.cwd, p) || '.') : p);
  const budget = {
    add: (d: Usage) => {
      env.budget.add(d);
      used = { inputTokens: used.inputTokens + d.inputTokens, outputTokens: used.outputTokens + d.outputTokens,
        cacheReadTokens: used.cacheReadTokens + d.cacheReadTokens, cacheCreationTokens: used.cacheCreationTokens + d.cacheCreationTokens,
        costUsd: used.costUsd + d.costUsd };
      env.onUsage(o.pass, o.batch, used);
    },
    get exceeded() { return env.budget.exceeded; },
  };
  const onEvent = (e: RunnerEvent): void => {
    if (e.type === 'log') env.log(e.level, e.message);
    else if (e.type === 'tool_use') pending.set(e.id, { tool: e.tool, path: rel(e.path), pattern: e.pattern, lines: e.lines });
    else if (e.type === 'tool_result') {
      const u = pending.get(e.toolUseId);
      if (!u) return;
      pending.delete(e.toolUseId);
      env.repos.outbound.insert({ id: randomUUID(), sessionId, scanId: env.scanId, tool: u.tool, path: u.path, pattern: u.pattern,
        lines: lineCount(u.lines), bytes: e.bytes, excerpt: e.excerpt, ts: new Date().toISOString() });
    }
  };

  const finish = (status: string): void => env.repos.claudeSessions.finish(sessionId, { usage: used, status });
  try {
    const { data } = await runStructured({ scanId: env.scanId, pass: o.pass, batch: o.batch, model: o.model, cwd: env.cwd,
      systemPrompt: system, prompt: o.prompt, budget, signal: env.signal, onEvent }, o.schema);
    finish('ok');
    return data;
  } catch (e) {
    if (e instanceof ClaudeRunnerError) {
      finish(e.kind === 'budget_exceeded' ? 'budget_exceeded' : e.kind === 'sandbox_violation' || e.kind === 'cancelled' ? 'killed' : 'error');
      if (e.kind === 'sandbox_violation') {
        const v = e.violation;
        env.internal.push({
          severity: 'high', category: 'sandbox-violation', rule: 'sandbox-violation',
          title: `Tentative d'accès interdit par la session ${o.pass}${o.batch ? ` (${o.batch})` : ''}`,
          file: v?.path ? rel(v.path) ?? '.' : '.', line: null,
          explanation: `La session Claude a tenté d'utiliser l'outil « ${v?.tool ?? '?'} » en dehors du bac à sable (${v?.reason ?? 'raison inconnue'}). Le contenu du dépôt tente peut-être de manipuler l'analyseur.`,
          fix: 'Examinez le dépôt (fichiers d\'instructions, README) avant toute utilisation ; ne lui faites pas confiance.',
          source: 'local',
        });
      }
    } else finish('error');
    throw e;
  }
}
