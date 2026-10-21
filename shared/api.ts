export type ErrorCode = 'bad_request' | 'invalid_repo' | 'invalid_ref' | 'unauthorized' | 'forbidden' | 'csrf'
  | 'rate_limited' | 'not_found' | 'conflict' | 'scan_not_cancellable' | 'repo_mismatch'
  | 'flow_in_progress' | 'internal';

export interface ApiErrorBody { error: { code: ErrorCode; message: string } }
export interface AlertState { unacknowledgedBlocked: number; lastBlockedAt: string | null; lastAckAt: string | null }
