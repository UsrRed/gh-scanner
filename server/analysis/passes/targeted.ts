import { renderPrompt } from '../prompts.js';
import { TargetedOutput, type MappingOutputT } from '../schemas.js';
import type { RawFinding } from '../types.js';
import { runPassSession, type PassEnv } from './session.js';

/** Pass 2: one targeted session for a batch of categories (Sonnet). Snippets are re-read from the clone later. */
export async function runTargeted(env: PassEnv, o: { model: string; repo: string; batch: string; mapping: MappingOutputT | null }): Promise<RawFinding[]> {
  const prompt = renderPrompt('targeted', { repo: o.repo, batch: o.batch, mapping: JSON.stringify(o.mapping ?? {}) });
  const out = await runPassSession(env, { pass: 'targeted', batch: o.batch, model: o.model, prompt, schema: TargetedOutput });
  return out.findings.map(({ vulnerability, threat, probability, impact, ...f }) => ({
    ...f, source: 'claude' as const,
    risk: { vulnerability, threat, probability, impact } as RawFinding['risk'],
  }));
}
