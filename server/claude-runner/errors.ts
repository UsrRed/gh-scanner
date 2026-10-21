import type { ClaudeErrorKind } from './types.js';
import { redact } from '../redact/index.js';

export type { ClaudeErrorKind } from './types.js';

const MESSAGES: Record<ClaudeErrorKind, string> = {
  cli_missing: "Le CLI « claude » est introuvable : installez-le ou renseignez SCANNER_CLAUDE_BIN.",
  not_authenticated: "Claude n'est pas authentifié : connectez-vous dans Réglages ou configurez ANTHROPIC_API_KEY.",
  quota: 'Quota ou limite de débit Claude atteint : réessayez plus tard.',
  timeout: "La session Claude a dépassé la durée maximale autorisée (SCANNER_SESSION_TIMEOUT_S).",
  sandbox_violation: "Session Claude interrompue : tentative d'accès hors du bac à sable.",
  budget_exceeded: "Budget d'analyse dépassé : l'analyse a été interrompue.",
  cancelled: 'Analyse annulée.',
  invalid_output: 'Claude a renvoyé une sortie invalide (JSON non conforme) même après une relance.',
  process_error: "Le processus Claude s'est terminé en erreur.",
};

export interface SandboxViolation { tool: string; path: string | null; reason: string }

export class ClaudeRunnerError extends Error {
  kind: ClaudeErrorKind;
  userMessage: string;
  detail?: string;
  violation?: SandboxViolation;
  constructor(kind: ClaudeErrorKind, detail?: string, violation?: SandboxViolation) {
    super(`${kind}${detail ? `: ${redact(detail)}` : ''}`);
    this.name = 'ClaudeRunnerError';
    this.kind = kind;
    this.userMessage = MESSAGES[kind];
    if (detail) this.detail = redact(detail);
    if (violation) this.violation = violation;
  }
}

/** Classify a CLI error text (result message / stderr) into an error kind. */
export function classifyCliError(text: string): ClaudeErrorKind {
  if (/invalid api key|please run \/login|not logged in|not authenticated|authentication[_ ]error|oauth token|\b401\b/i.test(text)) return 'not_authenticated';
  if (/usage limit|rate[ _]limit|quota|credit balance|too many requests|overloaded|\b429\b/i.test(text)) return 'quota';
  return 'process_error';
}
