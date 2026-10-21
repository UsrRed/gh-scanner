import type { Usage } from '../../shared/types.js';
import { redact } from '../redact/index.js';
import { toolPathOf } from './sandbox-guard.js';

export type RawItem =
  | { kind: 'init'; sessionId: string }
  | { kind: 'tool_use'; id: string; tool: string; input: unknown; path: string | null; pattern: string | null; lines: string | null }
  | { kind: 'tool_result'; toolUseId: string; bytes: number; excerpt: string }
  | { kind: 'text'; text: string }
  | { kind: 'usage'; usage: Omit<Usage, 'costUsd'> }
  | { kind: 'result'; isError: boolean; text: string; sessionId: string | null; usage: Usage };

const EXCERPT_MAX = 300;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function usageOf(u: unknown): Omit<Usage, 'costUsd'> {
  const o = (u ?? {}) as Record<string, unknown>;
  return { inputTokens: num(o.input_tokens), outputTokens: num(o.output_tokens),
    cacheReadTokens: num(o.cache_read_input_tokens), cacheCreationTokens: num(o.cache_creation_input_tokens) };
}

function contentText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('');
  return '';
}

/** Tolerant line parser: unknown/garbled lines yield no items. */
export function parseStreamLine(line: string): RawItem[] {
  const t = line.trim();
  if (!t.startsWith('{')) return [];
  let o: Record<string, unknown>;
  try { o = JSON.parse(t) as Record<string, unknown>; } catch { return []; }
  const out: RawItem[] = [];
  if (o.type === 'system' && o.subtype === 'init' && typeof o.session_id === 'string') out.push({ kind: 'init', sessionId: o.session_id });
  else if (o.type === 'assistant' || o.type === 'user') {
    const msg = (o.message ?? {}) as Record<string, unknown>;
    const content = Array.isArray(msg.content) ? msg.content as Record<string, unknown>[] : [];
    for (const p of content) {
      if (!p || typeof p !== 'object') continue;
      if (p.type === 'tool_use' && typeof p.id === 'string' && typeof p.name === 'string') {
        const inp = (p.input ?? {}) as Record<string, unknown>;
        const off = inp.offset, lim = inp.limit;
        out.push({ kind: 'tool_use', id: p.id, tool: p.name, input: p.input,
          path: toolPathOf(inp), pattern: typeof inp.pattern === 'string' ? inp.pattern : null,
          lines: off !== undefined || lim !== undefined ? `${num(off)}+${num(lim)}` : null });
      } else if (p.type === 'tool_result') {
        const text = contentText(p.content);
        out.push({ kind: 'tool_result', toolUseId: String(p.tool_use_id ?? ''), bytes: Buffer.byteLength(text),
          excerpt: redact(text.slice(0, EXCERPT_MAX), { repoContent: true }) });
      } else if (p.type === 'text' && typeof p.text === 'string') out.push({ kind: 'text', text: p.text });
    }
    if (o.type === 'assistant' && msg.usage) out.push({ kind: 'usage', usage: usageOf(msg.usage) });
  } else if (o.type === 'result') {
    out.push({ kind: 'result', isError: o.is_error === true || (typeof o.subtype === 'string' && o.subtype.startsWith('error')),
      text: typeof o.result === 'string' ? o.result : '', sessionId: typeof o.session_id === 'string' ? o.session_id : null,
      usage: { ...usageOf(o.usage), costUsd: num(o.total_cost_usd) } });
  }
  return out;
}
