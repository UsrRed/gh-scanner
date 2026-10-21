import type { EgressEvent, OutboundSummary, PassName, Usage } from './types';
export type ErrorCode = 'bad_request' | 'invalid_repo' | 'invalid_ref' | 'unauthorized' | 'forbidden' | 'csrf'
  | 'rate_limited' | 'not_found' | 'conflict' | 'scan_not_cancellable' | 'repo_mismatch'
  | 'flow_in_progress' | 'internal';

export interface ApiErrorBody { error: { code: ErrorCode; message: string } }
export interface AlertState { unacknowledgedBlocked: number; lastBlockedAt: string | null; lastAckAt: string | null }

export interface ScanOutbound { scanId: string; sessions: { id: string; pass: PassName; batch: string | null; model: string;
    promptBytes: number; prompt: string; usage: Usage; status: string }[];
  reads: { id: string; sessionId: string; tool: 'Read' | 'Grep' | 'Glob'; path: string | null; pattern: string | null; lines: string | null; bytes: number }[];
  files: { path: string; bytes: number; reads: number }[];
  anthropic: { connections: number; bytesUp: number; bytesDown: number }; github: EgressEvent[];
  summary: OutboundSummary }
