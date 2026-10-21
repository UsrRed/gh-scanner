import type { Inventory } from '../../cloner/inventory.js';
import { extractSnippet } from '../snippet.js';
import type { RawFinding } from '../types.js';
import { detectSecrets } from './secrets.js';
import { detectCi } from './ci.js';
import { detectNpmScripts } from './npm-scripts.js';
import { detectPromptInjection } from './prompt-injection.js';
import { readText } from './util.js';

const MAX_SECRET_FILE = 2_000_000;

export async function runLocalDetectors(dir: string, inv: Inventory): Promise<RawFinding[]> {
  const out: RawFinding[] = [];
  const ci = new Set(inv.ciWorkflows);
  for (const f of inv.files) {
    if (f.kind !== 'text' || f.size > MAX_SECRET_FILE) continue;
    const text = await readText(dir, f.path);
    if (text === null) continue;
    out.push(...detectSecrets(f.path, text));
    if (ci.has(f.path)) out.push(...detectCi(f.path, text));
    if (f.path.split('/').pop() === 'package.json') out.push(...detectNpmScripts(f.path, text));
    if (/\.(?:md|mdx|markdown|txt|rst|ya?ml|json|js|ts|py)$/i.test(f.path) || /^readme/i.test(f.path.split('/').pop() ?? '')) {
      out.push(...detectPromptInjection(f.path, text));
    }
  }
  for (const f of out) f.snippet = await extractSnippet(dir, f.file, f.line);
  return out;
}

export { extractSnippet } from '../snippet.js';
