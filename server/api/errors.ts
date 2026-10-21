export type ErrorCode = 'bad_request' | 'invalid_repo' | 'invalid_ref' | 'unauthorized' | 'forbidden' | 'csrf' | 'rate_limited'
  | 'not_found' | 'conflict' | 'scan_not_cancellable' | 'repo_mismatch' | 'flow_in_progress' | 'internal';

export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number, message: string) { super(message); }
}
