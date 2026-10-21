import type { EgressEvent, OutboundSummary, Page } from '../../shared/types.js';
import type { AlertState } from '../../shared/api.js';
import type { Repos } from '../db/repos/index.js';
import type { WsHub } from '../ws/index.js';

export type { EgressFilter } from '../db/repos/egress-events.js';
import type { EgressFilter } from '../db/repos/egress-events.js';

export interface EgressLog {
  ingest(events: EgressEvent[]): void;
  list(f: EgressFilter, page: number, pageSize: number): Page<EgressEvent>;
  totals(f: EgressFilter): OutboundSummary['destinations'];
  alertState(): AlertState;
  ack(): AlertState;
  acknowledge(): AlertState;
  forScan(scanId: string): EgressEvent[];
  summaryForScan(scanId: string): { destinations: OutboundSummary['destinations']; blockedConnections: number };
}

const ACK_KEY = 'egress.lastAckAt';

export function createEgressLog(deps: { repos: Repos; ws: Pick<WsHub, 'broadcast'> }): EgressLog {
  const { repos, ws } = deps;
  const alertState = (): AlertState => {
    const lastAckAt = repos.kv.get(ACK_KEY);
    const unack = repos.egressEvents.count({ blocked: true, ...(lastAckAt ? { from: lastAckAt } : {}) });
    // "from" is inclusive: events at exactly the ack instant were acknowledged
    const atAck = lastAckAt ? repos.egressEvents.count({ blocked: true, from: lastAckAt, to: lastAckAt }) : 0;
    return { unacknowledgedBlocked: unack - atAck, lastBlockedAt: repos.egressEvents.lastBlockedAt(), lastAckAt };
  };
  const ack = (): AlertState => {
    repos.kv.set(ACK_KEY, new Date().toISOString());
    return alertState();
  };
  const forScan = (scanId: string) => repos.egressEvents.list({ scanId }, 1, 100000).items;
  return {
    ingest(events) {
      if (!events.length) return;
      repos.egressEvents.insertMany(events);
      const alert = alertState();
      for (const event of events) ws.broadcast({ type: 'egress.event', ts: new Date().toISOString(), data: { event, alert } });
    },
    list: (f, page, pageSize) => repos.egressEvents.list(f, page, pageSize),
    totals: (f) => repos.egressEvents.totals(f),
    alertState,
    ack,
    acknowledge: ack,
    forScan,
    summaryForScan(scanId) {
      return { destinations: repos.egressEvents.totals({ scanId }), blockedConnections: repos.egressEvents.count({ scanId, blocked: true }) };
    },
  };
}
