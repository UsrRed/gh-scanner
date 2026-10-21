import type { PassName, Usage } from '../../shared/types.js';

export type RunnerEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'tool_use'; id: string; tool: string; path: string | null; pattern: string | null; lines: string | null }
  | { type: 'tool_result'; toolUseId: string; bytes: number; excerpt: string }
  | { type: 'usage'; usage: Usage };

export type ClaudeErrorKind = 'cli_missing' | 'not_authenticated' | 'quota' | 'timeout' | 'sandbox_violation'
  | 'budget_exceeded' | 'cancelled' | 'invalid_output' | 'process_error';

/** Structural subset of analysis BudgetTracker. */
export interface BudgetLike { add(delta: Usage): void; readonly exceeded: boolean }

export interface ClaudeSessionOptions {
  scanId: string; pass: PassName; batch: string | null; model: string; cwd: string;
  systemPrompt: string; prompt: string; budget: BudgetLike; signal: AbortSignal; onEvent(e: RunnerEvent): void;
}
export interface ClaudeSessionResult { sessionId: string; text: string; usage: Usage; promptBytes: number }
