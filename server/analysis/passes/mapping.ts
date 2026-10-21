import type { Inventory } from '../../cloner/inventory.js';
import { renderPrompt } from '../prompts.js';
import { MappingOutput, type MappingOutputT } from '../schemas.js';
import { runPassSession, type PassEnv } from './session.js';

const MAX_LISTED = 1500;

export function formatInventory(inv: Inventory): string {
  const lines = inv.files.slice(0, MAX_LISTED).map((f) => `${f.path} (${f.size} B, ${f.kind})`);
  if (inv.files.length > MAX_LISTED) lines.push(`… ${inv.files.length - MAX_LISTED} fichiers supplémentaires`);
  return lines.join('\n');
}

/** Pass 1: repository mapping (Sonnet). */
export function runMapping(env: PassEnv, o: { model: string; repo: string; ref: string | null; inventory: Inventory }): Promise<MappingOutputT> {
  const prompt = renderPrompt('mapping', { repo: o.repo, ref: o.ref ?? 'défaut', inventory: formatInventory(o.inventory) });
  return runPassSession(env, { pass: 'mapping', batch: null, model: o.model, prompt, schema: MappingOutput });
}
