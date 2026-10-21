export type ScanStatus = 'queued' | 'cloning' | 'mapping' | 'analyzing' | 'synthesizing'
  | 'done' | 'failed' | 'cancelled' | 'budget_exceeded';
export const ACTIVE_STATUSES: ScanStatus[] = ['cloning', 'mapping', 'analyzing', 'synthesizing'];
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Verdict = 'trust' | 'caution' | 'do-not-install';
export type PassName = 'mapping' | 'targeted' | 'synthesis';
export type FindingCategory = 'secrets' | 'injection' | 'deserialization' | 'dependencies' | 'ci-cd'
  | 'install-scripts' | 'obfuscation' | 'exfiltration' | 'quality' | 'prompt-injection'
  | 'sandbox-violation' | 'symlink';

export interface Usage {
  inputTokens: number; outputTokens: number; cacheReadTokens: number;
  cacheCreationTokens: number; costUsd: number;
}

export interface ScanFailure { code: string; message: string }
export interface Scan {
  id: string; repo: string; ref: string | null; keepClone: boolean;
  status: ScanStatus; failure: ScanFailure | null; queuePosition: number | null;
  commitSha: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null;
  usage: Usage; score: number | null; claudeVerdict: Verdict | null; previousScanId: string | null;
}

export interface Finding {
  id: string; scanId: string; severity: Severity; category: FindingCategory; rule: string;
  title: string; file: string; line: number | null; snippet: string;
  explanation: string; fix: string; source: 'claude' | 'local'; fingerprint: string;
}

export interface PassUsage {
  pass: PassName; batch: string | null; model: string; usage: Usage;
  status: 'ok' | 'error' | 'killed' | 'budget_exceeded';
}

export interface EgressEvent {
  id: string; startedAt: string; endedAt: string; host: string; port: number;
  bytesUp: number; bytesDown: number; durationMs: number;
  status: 'ok' | 'blocked' | 'error'; httpStatus: number; blocked: boolean;
  purpose: string; scanId: string | null; error: string | null;
}

export interface OutboundSummary {
  files: number; bytesToClaude: number; promptBytes: number;
  destinations: { host: string; connections: number; bytesUp: number; bytesDown: number }[];
  blockedConnections: number;
}

export interface Report {
  scan: Scan; score: number; scoreFormula: string; claudeVerdict: Verdict | null; justification: string | null;
  counts: Record<Severity, number>; findings: Finding[]; passes: PassUsage[];
  outbound: OutboundSummary; partial: boolean;
}

export interface Comparison {
  repo: string; base: Scan; head: Scan; scoreDelta: number;
  added: Finding[]; resolved: Finding[]; persisting: Finding[];
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
