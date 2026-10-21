import fs from 'node:fs';
import path from 'node:path';
import type { FindingCategory, PassName } from '../../shared/types.js';
import { redact } from '../redact/index.js';
import { promptsDir } from '../paths.js';

export const PASS2_BATCHES: { id: string; categories: FindingCategory[] }[] = [
  { id: 'secrets-deps', categories: ['secrets', 'dependencies'] },
  { id: 'injection-install', categories: ['injection', 'deserialization', 'install-scripts', 'obfuscation', 'exfiltration'] },
  { id: 'ci-cd', categories: ['ci-cd'] },
  { id: 'quality', categories: ['quality'] },
  { id: 'prompt-injection', categories: ['prompt-injection'] },
];

const FILES: Record<PassName, string> = {
  mapping: 'pass1-mapping.md',
  targeted: 'pass2-targeted.md',
  synthesis: 'pass3-synthesis.md',
};

const read = (name: string): string => fs.readFileSync(path.join(promptsDir(), name), 'utf8');

export const promptsVersion = (): string => read('VERSION').trim();
export const systemPrompt = (): string => read('system.md');

/** Renders a pass prompt; every variable value is redacted. Starts with a `PASS: <name>` marker line. */
export function renderPrompt(pass: PassName, vars: Record<string, string>): string {
  let tpl = read(FILES[pass]);
  const v = { ...vars };
  if (pass === 'targeted') {
    const sections = new Map<string, string>();
    const parts = tpl.split(/<!-- SECTION: ([\w-]+) -->\n/);
    tpl = parts[0] ?? '';
    for (let i = 1; i < parts.length; i += 2) sections.set(parts[i] ?? '', (parts[i + 1] ?? '').trim());
    const batch = v.batch ?? '';
    if (!sections.has(batch)) throw new Error(`unknown pass2 batch: ${batch}`);
    v.section = sections.get(batch) ?? '';
    v.categories ??= PASS2_BATCHES.find((b) => b.id === batch)?.categories.join(', ') ?? '';
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => redact(v[k] ?? '', { repoContent: true })).trim() + '\n';
}
