export interface Migration { version: number; sql: string }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE scans(
  id TEXT PRIMARY KEY, repo TEXT NOT NULL, ref TEXT, keep_clone INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, failure_code TEXT, failure_message TEXT, commit_sha TEXT,
  created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  usage_json TEXT NOT NULL, score INTEGER, claude_verdict TEXT, justification TEXT,
  partial INTEGER NOT NULL DEFAULT 0, previous_scan_id TEXT
);
CREATE INDEX idx_scans_repo_created ON scans(repo, created_at);
CREATE INDEX idx_scans_status ON scans(status);
CREATE TABLE scan_logs(
  scan_id TEXT NOT NULL, seq INTEGER NOT NULL, ts TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL,
  PRIMARY KEY(scan_id, seq)
);
CREATE TABLE findings(
  id TEXT PRIMARY KEY, scan_id TEXT NOT NULL, severity TEXT NOT NULL, category TEXT NOT NULL, rule TEXT NOT NULL,
  title TEXT NOT NULL, file TEXT NOT NULL, line INTEGER, snippet TEXT NOT NULL, explanation TEXT NOT NULL,
  fix TEXT NOT NULL, source TEXT NOT NULL, fingerprint TEXT NOT NULL
);
CREATE INDEX idx_findings_scan ON findings(scan_id);
CREATE TABLE claude_sessions(
  id TEXT PRIMARY KEY, scan_id TEXT, pass TEXT NOT NULL, batch TEXT, model TEXT NOT NULL, prompt TEXT NOT NULL,
  prompt_bytes INTEGER NOT NULL, usage_json TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
);
CREATE INDEX idx_claude_sessions_scan ON claude_sessions(scan_id);
CREATE TABLE outbound_reads(
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, scan_id TEXT, tool TEXT NOT NULL, path TEXT, pattern TEXT,
  lines INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, excerpt TEXT, ts TEXT NOT NULL
);
CREATE INDEX idx_outbound_scan ON outbound_reads(scan_id);
CREATE TABLE egress_events(
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL,
  bytes_up INTEGER NOT NULL, bytes_down INTEGER NOT NULL, duration_ms INTEGER NOT NULL, status TEXT NOT NULL,
  http_status INTEGER NOT NULL, blocked INTEGER NOT NULL, purpose TEXT NOT NULL, scan_id TEXT, error TEXT
);
CREATE INDEX idx_egress_started ON egress_events(started_at);
CREATE INDEX idx_egress_host ON egress_events(host);
CREATE INDEX idx_egress_scan ON egress_events(scan_id);
CREATE TABLE auth_sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE login_attempts(ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, ts);
CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
  { version: 2, sql: 'ALTER TABLE findings ADD COLUMN risk_json TEXT;' },
];
