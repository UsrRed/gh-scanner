import type { Finding, PassUsage, Report, Severity } from '../../shared/types.js';
import type { Repos } from '../db/repos/index.js';
import type { EgressLog } from '../egress-log/index.js';
import { computeScore } from '../analysis/score.js';
import { redactDeep } from '../redact/index.js';
import { buildComparison } from './compare.js';
import { buildExportJson, type ExportV1 } from './export-json.js';
import { buildMarkdown } from './export-md.js';
import type { Comparison } from '../../shared/types.js';

export const SCORE_FORMULA = '100 − 40×critique − 15×élevé − 5×moyen − 1×faible (min 0)';
export type { ExportV1 };

export class ReportError extends Error {
  constructor(public code: 'not_found' | 'different_repos', message: string) { super(message); }
}

export interface ReportService {
  buildReport(scanId: string): Report;
  compareScans(baseId: string, headId: string): Comparison;
  exportJson(scanId: string): ExportV1;
  exportMarkdown(scanId: string): string;
}

const PASS_STATUS: Record<string, PassUsage['status']> = { ok: 'ok', killed: 'killed', budget_exceeded: 'budget_exceeded' };

export function createReportService(deps: { repos: Repos; egressLog: Pick<EgressLog, 'summaryForScan'> }): ReportService {
  const { repos, egressLog } = deps;

  const buildReport = (scanId: string): Report => {
    const scan = repos.scans.get(scanId);
    if (!scan) throw new ReportError('not_found', 'scan not found');
    const findings: Finding[] = repos.findings.listByScan(scanId);
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;
    const sessions = repos.claudeSessions.listByScan(scanId);
    const passes: PassUsage[] = sessions.map((s) => ({ pass: s.pass, batch: s.batch, model: s.model, usage: s.usage,
      status: PASS_STATUS[s.status] ?? 'error' }));
    const reads = repos.outbound.summary(scanId);
    const eg = egressLog.summaryForScan(scanId);
    const meta = repos.scans.meta(scanId);
    return redactDeep({
      scan, score: scan.score ?? computeScore(findings), scoreFormula: SCORE_FORMULA, claudeVerdict: scan.claudeVerdict,
      justification: meta?.justification ?? null, counts, findings, passes,
      outbound: { files: reads.files, bytesToClaude: reads.bytes, promptBytes: sessions.reduce((n, s) => n + s.promptBytes, 0),
        destinations: eg.destinations, blockedConnections: eg.blockedConnections },
      partial: meta?.partial ?? false,
    });
  };

  const compareScans = (baseId: string, headId: string): Comparison => {
    const base = repos.scans.get(baseId); const head = repos.scans.get(headId);
    if (!base || !head) throw new ReportError('not_found', 'scan not found');
    if (base.repo !== head.repo) throw new ReportError('different_repos', 'scans belong to different repositories');
    return redactDeep(buildComparison(base, head, repos.findings.listByScan(baseId), repos.findings.listByScan(headId)));
  };

  return {
    buildReport, compareScans,
    exportJson: (scanId) => buildExportJson(buildReport(scanId)),
    exportMarkdown: (scanId) => buildMarkdown(buildReport(scanId)),
  };
}
