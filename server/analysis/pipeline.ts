import { randomUUID } from 'node:crypto';
import type { Finding, PassName, Scan, ScanFailure, ScanStatus, Usage, Verdict } from '../../shared/types.js';
import type { WsEvent } from '../../shared/ws.js';
import { ClaudeRunnerError } from '../claude-runner/index.js';
import { CloneError, buildInventory, type createCloner, type Inventory } from '../cloner/index.js';
import type { Config } from '../config/index.js';
import type { Repos } from '../db/repos/index.js';
import { redact } from '../redact/index.js';
import { parseRepoInput } from '../repo-input/index.js';
import { BudgetTracker } from './budget.js';
import { runLocalDetectors } from './detectors/index.js';
import { fingerprintOf } from './fingerprint.js';
import { mergeFindings } from './merge.js';
import { runMapping } from './passes/mapping.js';
import type { PassEnv } from './passes/session.js';
import { runSynthesis } from './passes/synthesis.js';
import { runTargeted } from './passes/targeted.js';
import { PASS2_BATCHES } from './prompts.js';
import { computeScore } from './score.js';
import type { MappingOutputT } from './schemas.js';
import { extractSnippet } from './snippet.js';
import type { RawFinding } from './types.js';

export interface PipelineDeps { repos: Repos; cloner: ReturnType<typeof createCloner> }
export interface PipelineInput {
  scan: Scan; config: Config; deps: PipelineDeps; signal: AbortSignal; emit(e: WsEvent): void;
}
export interface ScanOutcome { status: 'done' | 'failed' | 'budget_exceeded' | 'cancelled'; failure: ScanFailure | null }

const SCORE_FORMULA = '100 − 40×critique − 15×élevé − 5×moyen − 1×faible (min 0)';

const dedupClaude = (fs: RawFinding[]): RawFinding[] => {
  const seen = new Set<string>();
  return fs.filter((f) => { const k = `${f.file}:${f.line}:${f.rule}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

export async function runScanPipeline(input: PipelineInput): Promise<ScanOutcome> {
  const { scan, config, deps, signal, emit } = input;
  const { repos, cloner } = deps;
  const id = scan.id;
  const now = (): string => new Date().toISOString();
  const budget = new BudgetTracker({ usd: config.budgetUsd, tokens: config.budgetTokens });
  const budgetLimits = { usd: config.budgetUsd, tokens: config.budgetTokens };

  let status: ScanStatus = scan.status;
  const setStatus = (s: ScanStatus, extra: Parameters<Repos['scans']['update']>[1] = {}): void => {
    status = s;
    const updated = repos.scans.update(id, { status: s, ...extra });
    if (updated) emit({ type: 'scan.status', ts: now(), data: { scan: updated } });
  };
  const step = (label: string, detail?: string): void =>
    emit({ type: 'scan.step', ts: now(), data: { scanId: id, status, label, ...(detail ? { detail: redact(detail) } : {}) } });
  const log = (level: 'info' | 'warn' | 'error', msg: string): void => {
    const e = repos.logs.append(id, level, msg);
    emit({ type: 'scan.log', ts: e.ts, data: { scanId: id, seq: e.seq, level, message: e.message } });
  };
  const env: PassEnv = {
    scanId: id, cwd: '', repos, budget, budgetLimits, signal, internal: [], log,
    onUsage: (pass: PassName, batch: string | null, usage: Usage) =>
      emit({ type: 'scan.usage', ts: now(), data: { scanId: id, pass, batch, usage, total: budget.total, budget: budgetLimits } }),
  };

  let cloned = false;
  let partial = false;
  let budgetHit = false;
  let inv: Inventory | null = null;
  let local: RawFinding[] = [];
  const claude: RawFinding[] = [];
  let verdict: Verdict | null = null;
  let justification: string | null = null;

  const finishedFail = (failure: ScanFailure, st: 'failed' | 'cancelled'): ScanOutcome => {
    setStatus(st, { failure: st === 'failed' ? failure : null, finishedAt: now(), usage: budget.total, partial: true });
    return { status: st, failure: st === 'failed' ? failure : null };
  };

  try {
    const parsed = parseRepoInput({ repo: scan.repo, ref: scan.ref });
    if (!parsed.ok) return finishedFail({ code: parsed.error.code, message: parsed.error.message }, 'failed');
    const repo = parsed.value;

    setStatus('cloning', { startedAt: scan.startedAt ?? now() });
    step('Clonage', repo.fullName);
    const clone = await cloner.cloneRepo({ scanId: id, repo, signal, onLog: (l) => log('info', l) });
    cloned = true;
    env.cwd = clone.dir;
    repos.scans.update(id, { commitSha: clone.commitSha });
    for (const s of clone.ignoredSymlinks) log('warn', `Lien symbolique hors du dépôt ignoré: ${s}`);

    setStatus('mapping');
    step('Inventaire et détecteurs locaux');
    inv = await buildInventory(clone.dir);
    local = await runLocalDetectors(clone.dir, inv);
    for (const s of clone.ignoredSymlinks) {
      local.push({ severity: 'medium', category: 'symlink', rule: 'symlink-outside-clone', title: 'Lien symbolique pointant hors du dépôt',
        file: s, line: null, explanation: 'Ce lien symbolique cible un chemin extérieur au dépôt; il a été ignoré par le scanner.',
        fix: 'Supprimez le lien ou remplacez-le par un fichier du dépôt.', source: 'local' });
    }
    log('info', `${inv.files.length} fichiers inventoriés, ${local.length} constats locaux`);

    // The three passes; budget exhaustion or a sandbox violation degrades the report instead of failing the scan.
    const guarded = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch (e) {
        if (e instanceof ClaudeRunnerError && e.kind === 'budget_exceeded') { budgetHit = true; partial = true; return null; }
        if (e instanceof ClaudeRunnerError && e.kind === 'sandbox_violation') { partial = true; log('warn', e.userMessage); return null; }
        throw e;
      }
    };

    step('Passe 1 — cartographie');
    const mapping: MappingOutputT | null = await guarded(() => runMapping(env, { model: config.modelAnalysis, repo: repo.fullName, ref: repo.ref, inventory: inv! }));

    if (!budgetHit) {
      setStatus('analyzing');
      for (const b of PASS2_BATCHES) {
        if (budgetHit || budget.exceeded) { budgetHit = true; partial = true; break; }
        step('Passe 2 — analyse ciblée', b.id);
        const found = await guarded(() => runTargeted(env, { model: config.modelAnalysis, repo: repo.fullName, batch: b.id, mapping }));
        if (found) claude.push(...found);
      }
    }

    const consolidate = async (): Promise<Finding[]> => {
      const merged = mergeFindings(dedupClaude([...claude, ...env.internal]), local);
      const out: Finding[] = [];
      for (const f of merged) {
        const snippet = f.snippet ?? await extractSnippet(clone.dir, f.file, f.line);
        out.push({ id: randomUUID(), scanId: id, severity: f.severity, category: f.category, rule: f.rule, title: f.title, file: f.file,
          line: f.line, snippet, explanation: f.explanation, fix: f.fix, source: f.source, fingerprint: fingerprintOf({ rule: f.rule, file: f.file, snippet }) });
      }
      return out;
    };

    if (!budgetHit && !budget.exceeded) {
      setStatus('synthesizing');
      step('Passe 3 — synthèse');
      const raw = mergeFindings(dedupClaude([...claude, ...env.internal]), local);
      const syn = await guarded(() => runSynthesis(env, { model: config.modelSynthesis, repo: repo.fullName, findings: raw, score: computeScore(raw) }));
      if (syn) { verdict = syn.verdict; justification = syn.justification; }
      else partial = true;
    } else { budgetHit = true; partial = true; }

    const findings = await consolidate();
    repos.findings.deleteByScan(id);
    repos.findings.insertMany(findings);
    const score = computeScore(findings);
    const finalStatus = budgetHit ? 'budget_exceeded' : 'done';
    const failure = budgetHit ? { code: 'budget_exceeded', message: "Budget d'analyse dépassé : rapport partiel." } : null;
    setStatus(finalStatus, { failure, finishedAt: now(), usage: budget.total, score, claudeVerdict: verdict, justification, partial });
    step('Terminé', `${findings.length} constats, score ${score}`);
    return { status: finalStatus, failure };
  } catch (e) {
    if (signal.aborted || (e instanceof CloneError && e.kind === 'cancelled') || (e instanceof ClaudeRunnerError && e.kind === 'cancelled')) {
      return finishedFail({ code: 'cancelled', message: 'Analyse annulée.' }, 'cancelled');
    }
    const failure: ScanFailure = e instanceof ClaudeRunnerError ? { code: e.kind, message: redact(e.userMessage) }
      : e instanceof CloneError ? { code: e.kind, message: redact(e.message) }
      : { code: 'internal', message: redact((e as Error).message ?? 'erreur interne') };
    log('error', `${failure.code}: ${failure.message}`);
    return finishedFail(failure, 'failed');
  } finally {
    if (cloned && !scan.keepClone && !config.keepClones) await cloner.removeClone(id).catch(() => undefined);
  }
}
