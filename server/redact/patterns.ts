export interface TokenPattern { type: string; re: RegExp }

export const TOKEN_PATTERNS: TokenPattern[] = [
  { type: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g },
  { type: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { type: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { type: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{8,}/g },
  { type: 'aws-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g },
];

export const IPV4_RE = /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w]|\.\d)/g;

export const ALWAYS_KEPT_IP = (ip: string): boolean =>
  ip === '127.0.0.1' || ip === '0.0.0.0' ||
  ip.startsWith('192.0.2.') || ip.startsWith('198.51.100.') || ip.startsWith('203.0.113.');
