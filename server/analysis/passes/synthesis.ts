import { renderPrompt } from '../prompts.js';
import { SynthesisOutput, type SynthesisOutputT } from '../schemas.js';
import type { RawFinding } from '../types.js';
import { runPassSession, type PassEnv } from './session.js';

/** Pass 3: verdict and justification over consolidated findings (Opus). */
export function runSynthesis(env: PassEnv, o: { model: string; repo: string; findings: RawFinding[]; score: number }): Promise<SynthesisOutputT> {
  const compact = o.findings.map((f) => ({ severity: f.severity, category: f.category, rule: f.rule, title: f.title, file: f.file, line: f.line }));
  const prompt = renderPrompt('synthesis', { repo: o.repo, findings: JSON.stringify(compact), score: String(o.score) });
  return runPassSession(env, { pass: 'synthesis', batch: null, model: o.model, prompt, schema: SynthesisOutput });
}
