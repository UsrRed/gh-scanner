import type { RawFinding } from '../types.js';
import { lineOf } from './util.js';

const PR_CHECKOUT = /github\.event\.pull_request\.head\.(?:sha|ref)|github\.head_ref|refs\/pull\/[^\s'"]*\/(?:head|merge)/;

export function detectCi(file: string, text: string): RawFinding[] {
  const trig = /\bpull_request_target\b/.exec(text);
  if (!trig || !PR_CHECKOUT.test(text) || !/actions\/checkout/.test(text)) return [];
  return [{
    severity: 'high', category: 'ci-cd', rule: 'ci-pull-request-target-checkout',
    title: 'pull_request_target workflow checks out untrusted PR code',
    file, line: lineOf(text, trig.index), source: 'local',
    explanation: 'pull_request_target runs with repository secrets and a write token; checking out the PR head lets a contributor run arbitrary code with those privileges.',
    fix: 'Use the pull_request trigger, or do not check out the PR head in a pull_request_target workflow (split into an unprivileged build and a privileged follow-up).',
  }];
}
