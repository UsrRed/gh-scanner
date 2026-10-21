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

export type GhFlowState = 'starting' | 'pending' | 'connected' | 'expired' | 'cancelled' | 'error';
export interface GhFlow { id: string; state: GhFlowState; userCode: string | null; verificationUrl: string | null; expiresAt: string; message: string | null }
export interface GhStatus { connected: boolean; login: string | null; scopes: string[]; error: string | null }
export interface ClaudeStatus { mode: 'cli-login' | 'api-key' | 'none'; cliLoggedIn: boolean; apiKeyHint: string | null;
  lastCheck: { state: 'ok' | 'not_authenticated' | 'error'; message: string; at: string } | null }
export interface SettingsView { auth: { required: boolean }; github: GhStatus & { activeFlow: GhFlow | null };
  claude: ClaudeStatus; models: { analysis: string; synthesis: string }; budget: { usd: number; tokens: number };
  egress: { mode: 'embedded' | 'external'; allowlist: string[] }; concurrency: number }
export interface AuthMe { authRequired: boolean; authenticated: boolean; csrfToken: string | null }
