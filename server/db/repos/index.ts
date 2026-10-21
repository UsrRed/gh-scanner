import type { Db } from '../index.js';
import { authRepo } from './auth.js';
import { claudeSessionsRepo } from './claude-sessions.js';
import { egressEventsRepo } from './egress-events.js';
import { findingsRepo } from './findings.js';
import { kvRepo } from './kv.js';
import { logsRepo } from './logs.js';
import { outboundRepo } from './outbound.js';
import { scansRepo } from './scans.js';

export function createRepos(db: Db) {
  return {
    scans: scansRepo(db), findings: findingsRepo(db), logs: logsRepo(db), claudeSessions: claudeSessionsRepo(db),
    outbound: outboundRepo(db), egressEvents: egressEventsRepo(db), auth: authRepo(db), kv: kvRepo(db),
  };
}
export type Repos = ReturnType<typeof createRepos>;
