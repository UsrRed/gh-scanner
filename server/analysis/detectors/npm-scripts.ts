import type { RawFinding } from '../types.js';
import { lineOf } from './util.js';

const HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];
const SUSPICIOUS = /\b(?:curl|wget|nc|ncat|powershell|certutil)\b|\|\s*(?:sh|bash)\b|\beval\b|base64|node\s+-e\b|\/dev\/tcp|https?:\/\//i;

export function detectNpmScripts(file: string, text: string): RawFinding[] {
  let pkg: unknown;
  try { pkg = JSON.parse(text); } catch { return []; }
  const scripts = (pkg as { scripts?: Record<string, unknown> } | null)?.scripts;
  if (!scripts || typeof scripts !== 'object') return [];
  const out: RawFinding[] = [];
  for (const hook of HOOKS) {
    const cmd = scripts[hook];
    if (typeof cmd !== 'string' || !SUSPICIOUS.test(cmd)) continue;
    const idx = text.indexOf(`"${hook}"`);
    out.push({
      severity: 'high', category: 'install-scripts', rule: `npm-${hook}-suspicious`,
      title: `Suspicious ${hook} script`, file, line: idx >= 0 ? lineOf(text, idx) : null, source: 'local',
      explanation: `The ${hook} script runs automatically on install and downloads or executes remote/encoded code: ${cmd.slice(0, 120)}`,
      fix: 'Remove the lifecycle script or replace it with an explicit, reviewed build step; install with --ignore-scripts.',
    });
  }
  return out;
}
