import { truncateSecret } from '../../redact/index.js';
import type { RawFinding } from '../types.js';
import { lineOf } from './util.js';

export const SECRET_RULES: { rule: string; label: string; re: RegExp }[] = [
  { rule: 'secret-aws-key', label: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { rule: 'secret-github-token', label: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { rule: 'secret-api-key', label: 'API key (sk-)', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g },
  { rule: 'secret-private-key', label: 'Private key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/g },
];

/** Replaces every secret match in `text` by its truncated form. */
export function truncateSecrets(text: string): string {
  let out = text;
  for (const { re } of SECRET_RULES) out = out.replace(re, (m) => truncateSecret(m));
  return out;
}

export function detectSecrets(file: string, text: string): RawFinding[] {
  const out: RawFinding[] = [];
  for (const { rule, label, re } of SECRET_RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      out.push({
        severity: 'critical', category: 'secrets', rule,
        title: `${label} committed: ${truncateSecret(m[0])}`,
        file, line: lineOf(text, m.index ?? 0), source: 'local',
        explanation: `A value that looks like a ${label} is present in the repository (${truncateSecret(m[0])}).`,
        fix: 'Revoke the credential, remove it from the code and history, and load it from the environment or a secret manager.',
      });
    }
  }
  return out;
}
