import type { RawFinding } from '../types.js';
import { lineOf } from './util.js';

const PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:instructions|prompts?|rules)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|your)\s+(?:instructions|prompts?|rules)/i,
  /you\s+are\s+now\s+(?:a|an|in)\b[^\n]{0,60}/i,
  /(?:report|mark|rate)\s+this\s+(?:repo(?:sitory)?|project|code)\s+as\s+(?:trusted|safe|clean)/i,
  /do\s+not\s+(?:mention|reveal|tell)\s+(?:this|these)\s+(?:comment|instruction|message)s?/i,
  /(?:new|updated)\s+system\s+prompt\s*:/i,
];

export function detectPromptInjection(file: string, text: string): RawFinding[] {
  const hits: number[] = [];
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m) hits.push(m.index);
  }
  if (!hits.length) return [];
  const line = lineOf(text, Math.min(...hits));
  return [{
    severity: 'medium', category: 'prompt-injection', rule: 'prompt-injection-text',
    title: 'Text addressed to an AI reviewer', file, line, source: 'local',
    explanation: 'The file contains wording that tries to override an AI assistant\'s instructions or bias its verdict; it is treated as data, never obeyed.',
    fix: 'Remove the instruction-like text; legitimate projects have no reason to address automated reviewers.',
  }];
}
