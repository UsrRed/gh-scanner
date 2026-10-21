import type { Report } from '../../shared/types.js';
import { redactDeep } from '../redact/index.js';

export interface ExportV1 extends Report { schemaVersion: 1; exportedAt: string }

export function buildExportJson(report: Report): ExportV1 {
  return redactDeep({ schemaVersion: 1 as const, exportedAt: new Date().toISOString(), ...report });
}
