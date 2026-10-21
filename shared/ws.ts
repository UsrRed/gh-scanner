import type { EgressEvent, PassName, Scan, ScanStatus, Usage } from './types.js';
import type { AlertState } from './api.js';

export type WsEvent =
  | { type: 'scan.status'; ts: string; data: { scan: Scan } }
  | { type: 'scan.step'; ts: string; data: { scanId: string; status: ScanStatus; label: string; detail?: string } }
  | { type: 'scan.log'; ts: string; data: { scanId: string; seq: number; level: 'info' | 'warn' | 'error'; message: string } }
  | { type: 'scan.usage'; ts: string; data: { scanId: string; pass: PassName; batch: string | null; usage: Usage; total: Usage;
      budget: { usd: number; tokens: number } } }
  | { type: 'egress.event'; ts: string; data: { event: EgressEvent; alert: AlertState } }
  | { type: 'hello'; ts: string; data: { serverVersion: string } };
