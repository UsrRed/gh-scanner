# INTERFACES — gh-scanner (contrats figés)

Toute modification d'un contrat : mettre à jour ce fichier + noter dans `docs/PROGRESS.md`.

## 1. Types partagés (`shared/types.ts`)

```ts
export type ScanStatus = 'queued'|'cloning'|'mapping'|'analyzing'|'synthesizing'
  |'done'|'failed'|'cancelled'|'budget_exceeded';
export const ACTIVE_STATUSES: ScanStatus[] = ['cloning','mapping','analyzing','synthesizing'];
export type Severity = 'critical'|'high'|'medium'|'low'|'info';
export type Verdict = 'trust'|'caution'|'do-not-install';
export type PassName = 'mapping'|'targeted'|'synthesis';
export type FindingCategory = 'secrets'|'injection'|'deserialization'|'dependencies'|'ci-cd'
  |'install-scripts'|'obfuscation'|'exfiltration'|'quality'|'prompt-injection'
  |'sandbox-violation'|'symlink';

export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number;
  cacheCreationTokens: number; costUsd: number }

export interface ScanFailure { code: string; message: string }   // message masqué
export interface Scan {
  id: string; repo: string /* owner/name */; ref: string|null; keepClone: boolean;
  status: ScanStatus; failure: ScanFailure|null; queuePosition: number|null;
  commitSha: string|null; createdAt: string; startedAt: string|null; finishedAt: string|null;
  usage: Usage; score: number|null; claudeVerdict: Verdict|null; previousScanId: string|null;
}

export interface Finding {
  id: string; scanId: string; severity: Severity; category: FindingCategory; rule: string;
  title: string; file: string /* relatif */; line: number|null; snippet: string /* masqué, ≤20 lignes */;
  explanation: string; fix: string; source: 'claude'|'local'; fingerprint: string /* sha256 hex */;
}

export interface PassUsage { pass: PassName; batch: string|null; model: string; usage: Usage;
  status: 'ok'|'error'|'killed'|'budget_exceeded' }

export interface EgressEvent {
  id: string; startedAt: string; endedAt: string; host: string; port: number;
  bytesUp: number; bytesDown: number; durationMs: number;
  status: 'ok'|'blocked'|'error'; httpStatus: number /* 200, 403, 502… */; blocked: boolean;
  purpose: string /* ex 'scan.<id>.claude.mapping' | 'settings.gh-login' | 'app' | 'github' | 'anthropic' | 'unknown' */;
  scanId: string|null; error: string|null;
}

export interface OutboundSummary { files: number; bytesToClaude: number; promptBytes: number;
  destinations: { host: string; connections: number; bytesUp: number; bytesDown: number }[];
  blockedConnections: number }

export interface Report {
  scan: Scan; score: number; scoreFormula: string; claudeVerdict: Verdict|null; justification: string|null;
  counts: Record<Severity, number>; findings: Finding[]; passes: PassUsage[];
  outbound: OutboundSummary; partial: boolean;
}

export interface Comparison { repo: string; base: Scan; head: Scan; scoreDelta: number;
  added: Finding[]; resolved: Finding[]; persisting: Finding[] }

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
```

## 2. Configuration (`server/config`)

```ts
export interface Config {
  host: string; port: number; dataDir: string; workDir: string;
  adminPassword: string|undefined; cookieSecure: boolean; containerLocal: boolean;
  concurrency: number; maxRepoMb: number; cloneTimeoutS: number; sessionTimeoutS: number;
  budgetUsd: number; budgetTokens: number; maxTurns: number;
  modelAnalysis: string; modelSynthesis: string; modelPing: string;
  keepClones: boolean; claudeBin: string /* défaut 'claude' */; ghBin: string /* défaut 'gh' */; gitBin: string;
  egressUrl: string|undefined;            // absent → proxy embarqué
  egressPort: number; egressHost: string; egressAllowlist: AllowEntry[];
  egressSharedDir: string; egressAppUrl: string; egressIngressPort: number|undefined;
  egressIngressTarget: string|undefined; egressHostOverrides: Record<string,string>;
  subprocessPath: string; anthropicApiKey: string|undefined;
}
export function loadConfig(env: NodeJS.ProcessEnv): Config;           // throws ConfigError (zod)
export function assertStartupAllowed(c: Config): void;                 // throws ConfigError
export function authRequired(c: Config): boolean;
```

| Variable | Défaut | Note |
|---|---|---|
| SCANNER_HOST | 127.0.0.1 | non-loopback ⇒ mot de passe requis sauf `SCANNER_CONTAINER_LOCAL=1` |
| SCANNER_PORT | 8417 | |
| SCANNER_DATA_DIR | /data | |
| SCANNER_WORK_DIR | /data/work | |
| SCANNER_ADMIN_PASSWORD | — | haché au 1er démarrage |
| SCANNER_COOKIE_SECURE | — | `1` ⇒ `Secure` |
| SCANNER_CONTAINER_LOCAL | — | compose uniquement |
| SCANNER_CONCURRENCY | 1 | |
| SCANNER_MAX_REPO_MB | 200 | |
| SCANNER_CLONE_TIMEOUT_S | 120 | |
| SCANNER_SESSION_TIMEOUT_S | 900 | |
| SCANNER_BUDGET_USD | 2 | |
| SCANNER_BUDGET_TOKENS | 1500000 | |
| SCANNER_MAX_TURNS | 60 | par session |
| SCANNER_MODEL_ANALYSIS | claude-sonnet-5-5 | |
| SCANNER_MODEL_SYNTHESIS | claude-opus-5-5 | |
| SCANNER_MODEL_PING | claude-haiku-5-5 | |
| SCANNER_KEEP_CLONES | false | |
| SCANNER_CLAUDE_BIN / SCANNER_GH_BIN / SCANNER_GIT_BIN | claude / gh / git | `.mjs/.js` ⇒ lancé via node |
| SCANNER_SUBPROCESS_PATH | /usr/local/bin:/usr/bin:/bin | PATH minimal (+ dossier de node ajouté) |
| SCANNER_EGRESS_URL | — | ex `http://egress:3128` |
| EGRESS_PORT | 3128 | |
| EGRESS_HOST | 0.0.0.0 (egress.js) / 127.0.0.1 (embarqué) | |
| EGRESS_ALLOWLIST | liste F8 (sans statsig) | CSV `host[:port]`, port défaut 443 |
| EGRESS_SHARED_DIR | `$SCANNER_DATA_DIR/egress` | secret + spool |
| EGRESS_APP_URL | http://app:8417 | |
| EGRESS_INGRESS_PORT / EGRESS_INGRESS_TARGET | — / app:8417 | relais Docker |
| EGRESS_HOST_OVERRIDES | — | **tests** : `host:port=127.0.0.1:port,…` |
| ANTHROPIC_API_KEY | — | sinon `secrets.json` |

## 3. Modules serveur (signatures publiques)

```ts
// redact
export interface RedactionContext { dataDir: string; workDir: string; hostname: string; username: string; homeDir: string }
export function initRedaction(ctx: RedactionContext): void;
export function registerSecret(value: string, label: string): void;     // clé API, secret proxy…
export function redact(text: string, opts?: { repoContent?: boolean }): string;
// clone <work>/<id>/x → '<repo>/x' ; dataDir → '<data>' ; hostname → '<host>' ; username → '<user>' ;
// IP → '<ip>' (repoContent: IP conservées sauf IP de l'hôte ; 127.0.0.1/0.0.0.0/RFC5737 toujours conservées)
// tokens → '[REDACTED:github-token|github-pat|anthropic-key|aws-key|jwt|private-key|secret]'
export function redactDeep<T>(value: T): T;
export function truncateSecret(s: string): string;                      // 'AKIA…'

// env-builder
export type SubprocessKind = 'claude'|'claude-pty'|'gh'|'gh-login'|'git';
export function buildSubprocessEnv(kind: SubprocessKind, ctx: { purpose: string; config: Config; apiKey?: string }): Record<string,string>; // alias buildEnv
// toujours: PATH, HOME, LANG=C.UTF-8, HTTPS_PROXY/HTTP_PROXY/https_proxy/http_proxy=http://<purpose>:x@<egress>,
//   DISABLE_TELEMETRY=1, DISABLE_ERROR_REPORTING=1, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1, GH_TELEMETRY=0,
//   GH_NO_UPDATE_NOTIFIER=1, NPM_CONFIG_UPDATE_NOTIFIER=false, NO_UPDATE_NOTIFIER=1, DO_NOT_TRACK=1
// claude*: HOME=<data>/claude-home (+ ANTHROPIC_API_KEY si configurée ; claude-pty: TERM=xterm-256color)
// gh*/git: HOME=<data>/home, GH_CONFIG_DIR=<data>/gh, GH_PROMPT_DISABLED=1 (absent pour gh-login), BROWSER=true,
//   GIT_TERMINAL_PROMPT=0, GIT_CONFIG_NOSYSTEM=1, GIT_CONFIG_GLOBAL=<data>/git/gitconfig, GIT_LFS_SKIP_SMUDGE=1
// Jamais rien lu de process.env.

// repo-input
export interface RepoRef { owner: string; name: string; fullName: string; ref: string|null }
export function parseRepoInput(input: { repo: string; ref?: string|null }):
  { ok: true; value: RepoRef } | { ok: false; error: { code: 'invalid_repo'|'invalid_ref'; message: string } };
export function isValidRef(ref: string): boolean;  // check-ref-format ou /^[0-9a-f]{7,40}$/i, pas de '-' initial

// proc
export interface SpawnTreeOptions { cwd: string; env: Record<string,string>; timeoutMs?: number; signal?: AbortSignal; stdin?: string }
export interface SpawnedTree { pid: number; child: ChildProcess; done: Promise<{ code: number|null; signal: string|null; timedOut: boolean }> }
export function resolveBin(bin: string): { cmd: string; prefixArgs: string[] };
export function spawnTree(bin: string, args: string[], o: SpawnTreeOptions): SpawnedTree;  // detached, shell:false
export function killTree(pid: number, graceMs?: number): Promise<void>;                     // SIGTERM -pgid, puis SIGKILL

// gh
export function runGh(args: string[], o: { purpose: string; config: Config; kind?: 'gh'|'gh-login'; timeoutMs?: number; signal?: AbortSignal; cwd?: string }):
  Promise<{ code: number; stdout: string; stderr: string }>;          // stdout/stderr masqués

// cloner
export interface CloneResult { dir: string; commitSha: string; sizeBytes: number; ignoredSymlinks: string[] }
export class CloneError extends Error { kind: 'gh_missing'|'not_found'|'auth_required'|'ref_not_found'|'too_large'|'timeout'|'cancelled'|'unsafe_origin'|'failed' }
export function createCloner(config: Config): { cloneRepo(o: { scanId: string; repo: RepoRef; signal: AbortSignal; onLog(line: string): void }): Promise<CloneResult>;
  removeClone(scanId: string): Promise<void>; cleanupOrphans(keepIds: string[]): Promise<number> };  // purpose proxy: scan.<id>.clone
export interface InventoryEntry { path: string; size: number; kind: 'text'|'binary'|'minified'|'symlink-outside' }
export interface Inventory { files: InventoryEntry[]; manifests: string[]; lockfiles: string[]; ciWorkflows: string[];
  installScripts: string[]; totalBytes: number; truncated: boolean }
export function buildInventory(dir: string): Promise<Inventory>;

// claude-runner
export type RunnerEvent =
  | { type: 'log'; level: 'info'|'warn'|'error'; message: string }
  | { type: 'tool_use'; id: string; tool: string; path: string|null; pattern: string|null; lines: string|null }
  | { type: 'tool_result'; toolUseId: string; bytes: number; excerpt: string }
  | { type: 'usage'; usage: Usage /* cumul de la session */ };
export interface ClaudeSessionOptions { scanId: string; pass: PassName; batch: string|null; model: string; cwd: string;
  systemPrompt: string; prompt: string; budget: BudgetTracker; signal: AbortSignal; onEvent(e: RunnerEvent): void }
export interface ClaudeSessionResult { sessionId: string; text: string; usage: Usage; promptBytes: number }
export type ClaudeErrorKind = 'cli_missing'|'not_authenticated'|'quota'|'timeout'|'sandbox_violation'
  |'budget_exceeded'|'cancelled'|'invalid_output'|'process_error';
export class ClaudeRunnerError extends Error { kind: ClaudeErrorKind; userMessage: string /* FR, masqué */; detail?: string }
export function runClaudeSession(o: ClaudeSessionOptions): Promise<ClaudeSessionResult>;
export function runStructured<T>(o: ClaudeSessionOptions, schema: ZodType<T>): Promise<{ data: T; result: ClaudeSessionResult }>; // 1 relance max
export function pingClaude(): Promise<{ state: 'ok'|'not_authenticated'|'error'; message: string }>;
export interface PtyHandle { id: string; onData(cb: (d: string) => void): void; write(d: string): void;
  resize(c: number, r: number): void; onExit(cb: (reason: 'logged_in'|'timeout'|'exited'|'closed') => void): void; close(): void }
export function spawnLoginPty(): PtyHandle;   // node-pty chargé paresseusement
export function initClaudeRunner(config: Config): void;  // à appeler au démarrage avant toute session
// ClaudeSessionOptions.budget: BudgetLike = { add(Usage): void; readonly exceeded: boolean } (sous-ensemble de BudgetTracker)
// ClaudeRunnerError.violation?: { tool; path: string|null; reason } (kind 'sandbox_violation' → finding sandbox-violation côté pipeline)
export function checkToolUse(cloneDir: string, tool: string, input: unknown): { ok: true } | { ok: false; reason: string };

// analysis
export class BudgetTracker { constructor(limits: { usd: number; tokens: number });
  add(delta: Usage): void; get total(): Usage; get exceeded(): boolean }
export interface PipelineContext { scan: Scan; repo: RepoRef; signal: AbortSignal;
  setStatus(s: ScanStatus): void; step(label: string, detail?: string): void; log(level: 'info'|'warn'|'error', msg: string): void }
export interface PipelineOutcome { status: 'done'|'failed'|'budget_exceeded'|'cancelled'; failure: ScanFailure|null }
export function runScanPipeline(i: { scan: Scan; config: Config; deps: { repos: Repos; cloner: ReturnType<typeof createCloner> };
  signal: AbortSignal; emit(e: WsEvent): void }): Promise<ScanOutcome>;   // T14: remplace PipelineContext/PipelineOutcome
// ScanOutcome = { status: 'done'|'failed'|'budget_exceeded'|'cancelled'; failure: ScanFailure|null }. Persiste statut/usage/score/verdict/findings,
// claude_sessions, outbound_reads, scan_logs ; émet scan.status/step/log/usage ; supprime le clone sauf keepClone/SCANNER_KEEP_CLONES.
export interface RawFinding extends Omit<Finding,'id'|'scanId'|'fingerprint'|'snippet'> { snippet?: string }
export function runLocalDetectors(dir: string, inv: Inventory): Promise<RawFinding[]>;
export function extractSnippet(dir: string, file: string, line: number|null, maxLines?: number): Promise<string>;
export function fingerprintOf(f: { rule: string; file: string; snippet: string }): string;
export function mergeFindings(claude: RawFinding[], local: RawFinding[]): RawFinding[]; // dédup (file,line,rule|category), local prioritaire
export function computeScore(fs: Pick<Finding,'severity'>[]): number;  // 100 −40c −15h −5m −1l, min 0
export const PASS2_BATCHES: { id: string; categories: FindingCategory[] }[];

// queue
export interface Queue { enqueue(r: RepoRef & { keepClone?: boolean }): Scan; cancel(id: string): Promise<Scan> /* AppError scan_not_cancellable si terminé */;
  rescan(id: string): Scan; list(): { running: Scan[]; queued: Scan[] }; position(id: string): number|null /* 1 = prochain */;
  positions(): Map<string, number>; recover(): Promise<number> /* actifs → failed 'interrompu', cleanupOrphans */; stop(): Promise<void> }
export function createQueue(deps: { config: Config; db: Db; broadcast(e: WsEvent): void; pipeline?: typeof runScanPipeline; cloner?: Cloner; cancelTimeoutMs?: number }): Queue;
// AppError/ErrorCode vivent dans server/api/errors.ts. scan.status émis à chaque transition (queuePosition pour les queued).

// egress
export interface AllowEntry { host: string; port: number }
export interface EgressSink { write(e: EgressEvent): void; close(): Promise<void> }
export function parseAllowlist(csv: string): AllowEntry[];
export function decodePurpose(header: string|undefined, host: string): { purpose: string; scanId: string|null };
export function startEgress(o: { host: string; port: number; allowlist: AllowEntry[]; hostOverrides: Record<string,string>;
  sink: EgressSink }): Promise<{ port: number; close(): Promise<void> }>;
export function createHttpShipper(o: { appUrl: string; secret: string; spoolFile: string; retryMs?: number }): EgressSink;
export function startIngressRelay(o: { port: number; target: string }): Promise<{ close(): Promise<void> }>;
export function ensureSharedSecret(dir: string): string;   // <dir>/secret, 600

// egress-log
export interface EgressFilter { host?: string; purpose?: string; scanId?: string; blocked?: boolean; from?: string; to?: string }
export interface EgressLog { ingest(events: EgressEvent[]): void; list(f: EgressFilter, page: number, pageSize: number): Page<EgressEvent>;
  totals(f: EgressFilter): OutboundSummary['destinations']; alertState(): AlertState; ack(): AlertState; forScan(scanId: string): EgressEvent[];
  acknowledge(): AlertState /* alias de ack */; summaryForScan(scanId: string): { destinations: OutboundSummary['destinations']; blockedConnections: number } }
export function createEgressLog(deps: { repos: Repos; ws: Pick<WsHub,'broadcast'> }): EgressLog;   // ack persisté dans kv 'egress.lastAckAt'

// auth
export function registerAuth(app: FastifyInstance, deps: { db: Db; config: Config }): Promise<void>;
export function hashPassword(pw: string): Promise<string>;  // 'scrypt$N$r$p$salt$hash'
export function verifyPassword(pw: string, stored: string): Promise<boolean>;

// settings-gh
export type GhFlowState = 'starting'|'pending'|'connected'|'expired'|'cancelled'|'error';
export interface GhFlow { id: string; state: GhFlowState; userCode: string|null; verificationUrl: string|null; expiresAt: string; message: string|null }
export interface GhStatus { connected: boolean; login: string|null; scopes: string[]; error: string|null }
export function parseDeviceOutput(text: string): { userCode: string|null; url: string|null };

// settings-claude
export interface ClaudeStatus { mode: 'cli-login'|'api-key'|'none'; cliLoggedIn: boolean; apiKeyHint: string|null /* 'sk-ant-…abcd' */;
  lastCheck: { state: 'ok'|'not_authenticated'|'error'; message: string; at: string }|null }

// report
export function createReportService(deps: { repos: Repos; egressLog: Pick<EgressLog,'summaryForScan'> }): ReportService;
interface ReportService {
  buildReport(scanId: string): Report;
  compareScans(baseId: string, headId: string): Comparison;   // throws ReportError('different_repos'|'not_found')
  exportJson(scanId: string): ExportV1;      // Report + schemaVersion:1 + exportedAt, redactDeep
  exportMarkdown(scanId: string): string;
}

// ws
export interface WsHub { broadcast(e: WsEvent): void /* redactDeep */; register(app: FastifyInstance, opts?: { authorize?: (req: FastifyRequest) => boolean }): Promise<void>; clientCount(): number }
export function createWsHub(opts?: { serverVersion?: string }): WsHub;   // envoie 'hello' à la connexion

// api errors
export class AppError extends Error { constructor(public code: ErrorCode, public status: number, message: string) }
export type ErrorCode = 'bad_request'|'invalid_repo'|'invalid_ref'|'unauthorized'|'forbidden'|'csrf'|'rate_limited'
  |'not_found'|'conflict'|'scan_not_cancellable'|'repo_mismatch'|'flow_in_progress'|'internal';
```

## 4. API HTTP (`/api`, JSON)

Erreur : `{ "error": { "code": ErrorCode, "message": string } }`. Mutations (POST/PUT/DELETE) : en-tête `X-CSRF-Token` obligatoire quand l'auth est active. Cookie `gsid` (HttpOnly, SameSite=Strict, 12 h).

| Méthode | Route | Corps / query | Réponse |
|---|---|---|---|
| GET | /api/health | — | `{ ok: true }` (sans auth) |
| GET | /api/auth/me | — | `{ authRequired, authenticated, csrfToken: string|null }` |
| POST | /api/auth/login | `{ password }` | 204 + cookie ; 401 ; 429 |
| POST | /api/auth/logout | — | 204 |
| POST | /api/scans | `{ repo, ref?, keepClone? }` | 201 `Scan` ; 400 `invalid_repo`/`invalid_ref` |
| GET | /api/scans | `repo?, status?, from?, to?, page=1, pageSize=20` | `Page<Scan>` |
| GET | /api/queue | — | `{ running: Scan[], queued: Scan[] }` |
| GET | /api/scans/:id | — | `Scan` |
| GET | /api/scans/:id/logs | `after?` | `{ items: { seq, ts, level, message }[] }` |
| POST | /api/scans/:id/cancel | — | `Scan` (409 si terminé) |
| POST | /api/scans/:id/rescan | — | 201 `Scan` |
| GET | /api/scans/:id/report | — | `Report` (409 si non terminé et sans résultat partiel) |
| GET | /api/scans/:id/outbound | — | `ScanOutbound` |
| GET | /api/scans/:id/outbound/reads/:readId | — | `{ id, path, bytes, excerpt }` |
| GET | /api/scans/:id/export | `format=json|md` | `ExportV1` / `text/markdown` (attachment) |
| GET | /api/compare | `base, head` | `Comparison` |
| GET | /api/egress/events | `host?, purpose?, scanId?, blocked?, from?, to?, page, pageSize` | `Page<EgressEvent>` |
| GET | /api/egress/totals | mêmes filtres | `{ destinations: OutboundSummary['destinations'] }` |
| GET | /api/egress/alerts | — | `AlertState` |
| POST | /api/egress/alerts/ack | — | `AlertState` |
| GET/POST | /api/egress, /api/egress/ack | alias de `/api/egress/events` et `/api/egress/alerts/ack` | idem |
| GET | /api/settings | — | `SettingsView` (jamais de secret) |
| POST | /api/settings/github/login | — | 202 `GhFlow` (409 si en cours) |
| GET | /api/settings/github/login/:flowId | — | `GhFlow` |
| DELETE | /api/settings/github/login/:flowId | — | `GhFlow` (cancelled) |
| POST | /api/settings/github/logout | — | `GhStatus` |
| PUT | /api/settings/claude/api-key | `{ apiKey }` (`^sk-ant-`) | `ClaudeStatus` |
| DELETE | /api/settings/claude/api-key | — | `ClaudeStatus` |
| POST | /api/settings/claude/verify | — | `ClaudeStatus` |
| POST | /api/settings/claude/console | — | 201 `{ consoleId, expiresAt }` |
| DELETE | /api/settings/claude/console/:id | — | 204 |
| GET | /api/disclosure | — | `{ markdown }` (contenu de `content/outbound-disclosure.md`) |
| POST | /internal/egress/events | `{ events: EgressEvent[] }`, en-tête `X-Egress-Secret` | 204 ; 401 (hors auth cookie, comparaison temps constant) |

```ts
interface AlertState { unacknowledgedBlocked: number; lastBlockedAt: string|null; lastAckAt: string|null }
interface SettingsView { auth: { required: boolean }; github: GhStatus & { activeFlow: GhFlow|null };
  claude: ClaudeStatus; models: { analysis: string; synthesis: string }; budget: { usd: number; tokens: number };
  egress: { mode: 'embedded'|'external'; allowlist: string[] }; concurrency: number }
interface ScanOutbound { scanId: string; sessions: { id: string; pass: PassName; batch: string|null; model: string;
    promptBytes: number; prompt: string /* masqué */; usage: Usage; status: string }[];
  reads: { id: string; sessionId: string; tool: 'Read'|'Grep'|'Glob'; path: string|null; pattern: string|null; lines: string|null; bytes: number }[];
  files: { path: string; bytes: number; reads: number }[];
  anthropic: { connections: number; bytesUp: number; bytesDown: number }; github: EgressEvent[];
  summary: OutboundSummary }
```

## 5. WebSocket

`GET /ws` (même cookie que l'API ; 401 à l'upgrade sinon). Serveur → client uniquement. Enveloppe :

```ts
type WsEvent =
  | { type: 'scan.status'; ts: string; data: { scan: Scan } }                       // inclut queuePosition
  | { type: 'scan.step';   ts: string; data: { scanId: string; status: ScanStatus; label: string; detail?: string } }
  | { type: 'scan.log';    ts: string; data: { scanId: string; seq: number; level: 'info'|'warn'|'error'; message: string } }
  | { type: 'scan.usage';  ts: string; data: { scanId: string; pass: PassName; batch: string|null; usage: Usage; total: Usage;
                                              budget: { usd: number; tokens: number } } }
  | { type: 'egress.event'; ts: string; data: { event: EgressEvent; alert: AlertState } }
  | { type: 'settings.gh_login'; ts: string; data: { flow: GhFlow } }
  | { type: 'settings.claude'; ts: string; data: { status: ClaudeStatus } }
  | { type: 'hello'; ts: string; data: { serverVersion: string } };
```
Toutes les chaînes passent par `redact` avant envoi. Client : reconnexion backoff 0.5 s → ×2 → 15 s max, indicateur `connected|connecting|offline`.

`GET /ws/pty/:consoleId` (cookie requis) : client → `{ t:'in', d:string } | { t:'resize', cols, rows }` ; serveur → `{ t:'out', d:string } | { t:'exit', reason }`.

## 6. Sorties Claude (zod, `server/analysis/schemas.ts`)

Réponse finale = un objet JSON (bloc ```json``` toléré).
```ts
MappingOutput = { languages: string[]; entryPoints: string[]; manifests: string[]; lockfiles: string[];
  ciWorkflows: string[]; installScripts: string[];
  riskZones: { path: string; reason: string; categories: FindingCategory[] }[] }
ClaudeFinding = { severity: Severity; category: FindingCategory; rule: string /* kebab */; title: string /* ≤160 */;
  file: string /* relatif, sans '..' */; line: number|null; explanation: string; fix: string }
TargetedOutput = { findings: ClaudeFinding[] }
SynthesisOutput = { verdict: Verdict; justification: string /* ≤1200 */; keyRisks: string[] }
```
Les extraits ne viennent jamais de Claude : relus via `extractSnippet` puis masqués.

## 7. Export JSON (`ExportV1`)

```ts
{ schemaVersion: 1; generatedAt: string; tool: { name: 'gh-scanner'; version: string; promptsVersion: string };
  scan: { id; repo; ref; commitSha; status; createdAt; finishedAt };
  result: { score; scoreFormula; claudeVerdict; justification; partial; counts: Record<Severity,number> };
  findings: Omit<Finding,'scanId'>[]; usage: { total: Usage; passes: PassUsage[] };
  outbound: OutboundSummary }
```
Markdown : titre, verdict/score, compteurs, findings groupés par sévérité (fichier:ligne, extrait en bloc de code, explication, correctif), consommation, « Sorties réseau du scan ». Les deux formats passent par `redactDeep`.

## 8. SQLite (`server/db/migrations.ts`, v1)

```
schema_migrations(version PK, applied_at)
scans(id PK, repo, ref, keep_clone, status, failure_code, failure_message, commit_sha, created_at, started_at, finished_at,
      usage_json, score, claude_verdict, justification, partial, previous_scan_id)   idx(repo, created_at), idx(status)
scan_logs(scan_id, seq, ts, level, message)                    PK(scan_id, seq)
findings(id PK, scan_id, severity, category, rule, title, file, line, snippet, explanation, fix, source, fingerprint)
claude_sessions(id PK, scan_id NULL, pass, batch, model, prompt, prompt_bytes, usage_json, status, started_at, ended_at)
outbound_reads(id PK, session_id, scan_id, tool, path, pattern, lines, bytes, excerpt, ts)
egress_events(id PK, started_at, ended_at, host, port, bytes_up, bytes_down, duration_ms, status, http_status,
              blocked, purpose, scan_id, error)            idx(started_at), idx(host), idx(scan_id)
auth_sessions(id PK /* sha256 du jeton */, csrf, created_at, expires_at)
login_attempts(ip, ts)
kv(key PK, value)            // egress.lastAckAt, etc.
```

## 9. Fichiers sur disque (`$SCANNER_DATA_DIR`, dossiers 700, fichiers 600)

```
scanner.db                 SQLite
auth.json                  { hash: 'scrypt$…', createdAt }
secrets.json               { anthropicApiKey?: string }
gh/                        GH_CONFIG_DIR (hosts.yml)
home/                      HOME de gh/git
git/gitconfig              core.hooksPath=/dev/null, credential.helper=!<gh> auth git-credential, submodule.recurse=false, filter.lfs.* vides
claude-home/               HOME de claude (.claude/.credentials.json après login)
claude/empty-mcp.json      {"mcpServers":{}}
claude/sandbox-settings.json  { permissions: { allow: ['Read(./**)','Grep','Glob'], deny: ['Bash','Write','Edit','WebFetch','WebSearch'] } }
work/<scanId>/             clone (SCANNER_WORK_DIR)
egress/secret              secret partagé app↔egress (EGRESS_SHARED_DIR)
egress/spool.jsonl         EgressEvent[] en attente (une ligne JSON par événement)
```

## 10. Faux CLI de test

- `test/fixtures/fake-claude.mjs` — scénario lu dans `$HOME/.fake-claude.json` : `{ "scenario": "success"|"forbidden-tool"|"outside-path"|"invalid-json"|"invalid-json-once"|"budget"|"injection"|"not-authenticated"|"quota"|"hang", "network"?: boolean }`. Passe détectée par le marqueur `PASS: <mapping|targeted:<batch>|synthesis>` dans le prompt (stdin). Émet des lignes stream-json : `{"type":"system","subtype":"init",…}`, `{"type":"assistant","message":{"content":[{"type":"tool_use","id","name","input"}],"usage":{…}}}`, `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id","content"}]}}`, `{"type":"result","subtype":"success","result":"<json>","total_cost_usd":n,"usage":{…}}`. `ping` → réponse courte. Mode PTY : affiche une URL de login, crée `.claude/.credentials.json` sur `/login`.
- `test/fixtures/fake-gh.mjs` — scénario `$GH_CONFIG_DIR/.fake-gh.json` : `{ "loggedIn": bool, "login": "octo-test", "clone": "ok"|"not_found"|"auth"|"slow"|"huge" }`. Sous-commandes : `repo clone`, `auth login` (imprime `! First copy your one-time code: ABCD-1234` et `https://github.com/login/device`, puis se connecte après ~300 ms), `auth status`, `api user`, `auth logout`, `auth git-credential`.

## 10. db (`server/db`, T03)

```ts
export interface Db { raw: BetterSqlite3.Database; tx<T>(fn: () => T): T /* imbriqué = rejoint */; close(): void }
export function openDb(path: string): Db;            // WAL, foreign_keys, migrations auto (schema_migrations)
export function createRepos(db: Db): Repos;          // server/db/repos/index.ts
// repos : scans, findings, logs, claudeSessions, outbound, egressEvents, auth, kv  (tout texte persisté passe par redact())
scans: create({id,repo,ref,keepClone,createdAt?}): Scan /* previousScanId auto */; get(id); update(id, ScanUpdate): Scan|null;
  meta(id): {justification, partial}|null; delete(id); list({repo?,status?,from?,to?}, page /*1-based*/, pageSize): Page<Scan>;
  queued(): Scan[]; byStatus(ScanStatus[]): Scan[]
findings: insertMany(Finding[]); listByScan(scanId) /* tri sévérité */; get(id); deleteByScan(scanId)
logs: append(scanId, level, message, ts?): {seq,ts,level,message}; list(scanId, after=0, limit=1000)
claudeSessions: insert(row); finish(id,{usage,status,endedAt?}); listByScan(scanId)
outbound: insert(OutboundRead); listByScan(scanId); summary(scanId): {files, bytes}
egressEvents: insertMany(EgressEvent[]) /* id dupliqué ignoré */; list(EgressFilter, page, pageSize): Page<EgressEvent>;
  totals(f): destinations[]; count(f); lastBlockedAt()
auth: create/get(id, now?)/delete/purgeExpired/recordLoginAttempt/countLoginAttempts/purgeLoginAttempts
kv: get(key): string|null; set(key, value); delete(key)
```

### settings-gh (T17, API serveur)
`createSettingsGh(config, { onChange?, timeoutMs? }): { startLogin(): GhFlow /* throws FlowInProgressError */; getFlow(id?): GhFlow|null; cancelFlow(id?): Promise<GhFlow|null>; status(): Promise<GhStatus>; logout(): Promise<GhStatus>; verifyStoragePermissions(): string[] }` — `server/settings-gh/index.ts`.
