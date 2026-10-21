# Audit de conformité — passe 1

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Saisie et validation d'un scan | ok | server/repo-input, NewScanPage; test/unit/repo-input.test.ts; e2e UI: ref '--upload-pack=x' rejeté avec invalid_ref (400) affiché inline | docs/qa/screenshots/error-state.png |
| F2 — File, suivi en direct, annulation, reprise | ok | server/queue, ws hub monté dans app.ts, queue.recover() appelé dans start.ts; QueuePage/ScanLivePage routées; test/unit/queue.test.ts, e2e passent; indicateur WS 'temps réel connecté' visible | docs/qa/screenshots/happy-path.png |
| F3 — Clonage jetable et sécurisé | ok | server/cloner + gh-cli, gitconfig, inventory; pipeline.ts importe cloner; test/integration/cloner.test.ts passe | — |
| F4 — Sessions Claude contraintes | ok | claude-runner/args.ts (allowedTools, disallowedTools, strict-mcp-config, settings, max-turns), sandbox-guard, env-builder liste blanche; test/unit/claude-runner.test.ts et proc-env passent | — |
| F5 — Analyse 3 passes et budget | ok | analysis/pipeline.ts câble mapping, targeted (PASS2_BATCHES), synthesis, runLocalDetectors, mergeFindings, computeScore, BudgetTracker; pipeline.test.ts et e2e OK; l'historique affiche score 25 et coû | docs/qa/screenshots/happy-path.png |
| F6 — Rapport, historique, comparaison, export | ok | server/report + routes reports; ReportPage, HistoryPage (filtres dépôt/statut/dates, pagination, tampon verdict), ComparePage routées; report.test.ts, test/web/report-pages.test.tsx passent. Léger déf | docs/qa/screenshots/happy-path.png |
| F7 — Masquage redact | ok | server/redact initialisé dans start.ts avant db; test/unit/redact.test.ts et leak-check e2e passent | — |
| F8 — Proxy de sortie et journal | ok | server/egress (proxy, allowlist, purpose, shipper), startEgress embarqué + ProxyAgent global dans start.ts, dist/egress.js; test/integration/egress.test.ts passe | — |
| F9 — Ce qui a quitté la machine pour ce scan | ok | outbound_reads/claude_sessions persistés, ScanOutboundPage routée (/scans/:id/outbound), OutboundSummary dans le rapport; test web egress-pages (liste fichiers+octets+extrait) passe | — |
| F10 — Page Sorties réseau et divulgation | ok | EgressPage, BlockedAlertBanner, badge '7' dans la nav (visible sur capture), DisclosurePage /disclosure; egress-pages tests passent | docs/qa/screenshots/happy-path.png |
| F11 — Paramètres: connexion GitHub | ok | settings-gh + device-parse, routes /api/settings/github/login, SettingsPage affiche flux et annulation; settings-gh.test.ts passe | — |
| F12 — Paramètres: connexion Claude | ok | settings-claude, secrets-store, ws/pty-bridge enregistré dans app.ts, XtermConsole utilisé par SettingsPage, clé API PUT/DELETE, revérifier; settings-api/settings-claude tests passent | — |
| F13 — Exposition réseau et authentification | ok | assertStartupAllowed dans start.ts, server/auth (scrypt, sessions, csrf, rate-limit), security-headers.ts (CSP default-src 'self', frame-ancestors 'none'); auth.test.ts et startup.test.ts (refus non-l | — |
| F14 — Aucune télémétrie, UI locale | ok | test/build/dist-no-external.test.ts passe; polices système; aucune dépendance analytics dans ARCHITECTURE §8 | — |
| F15 — Docker durci et documentation | partial | Dockerfile multi-stage, UID 10001, gh et claude-code épinglés; docker-compose.yml: 2 services, réseau internal:true, read_only, cap_drop ALL, no-new-privileges, pas de bind-mount; README FR complet (i | — |
| F16 — États d'interface et robustesse | ok | StateViews (vide/chargement/erreur) utilisé par les pages, erreurs uniformes api/errors.ts, WsProvider backoff + indicateur; state-views, ws-provider tests passent; capture d'erreur montre message inl | docs/qa/screenshots/error-state.png, docs/qa/screenshots/happy-path.png |
