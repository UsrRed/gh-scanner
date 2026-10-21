# Audit de conformité — passe 2

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Saisie et validation d'un scan | ok | server/repo-input, NewScanPage; test/unit/repo-input.test.ts. Capture: la ref '--upload-pack=x' est rejetée, le code invalid_ref s'affiche en ligne. | docs/qa/screenshots/error-state.png |
| F2 — File, suivi en direct, annulation, reprise | ok | server/queue, WsHub monté dans app.ts, queue.recover() dans start.ts; QueuePage et ScanLivePage routées. L'indicateur 'temps réel connecté' est visible sur la capture. Les tests queue et e2e passent ( | docs/qa/screenshots/happy-path.png |
| F3 — Clonage jetable et sécurisé | ok | server/cloner (gh-cli, gitconfig, inventory) importé par le pipeline; test/integration/cloner.test.ts passe. | — |
| F4 — Sessions Claude contraintes | ok | claude-runner/args.ts, sandbox-guard, env-builder en liste blanche; test/unit/claude-runner.test.ts et proc-env.test.ts passent. | — |
| F5 — Analyse en 3 passes et budget | ok | analysis/pipeline.ts câble mapping, targeted, synthesis, les détecteurs locaux, merge, score et BudgetTracker. pipeline.test.ts et l'e2e passent. L'historique affiche un score de 25, le coût et le ver | docs/qa/screenshots/happy-path.png |
| F6 — Rapport, historique, comparaison, export | ok | server/report, ReportPage, HistoryPage et ComparePage routées; report.test.ts et report-pages.test.tsx passent. Sur la capture, la table d'historique a un léger défaut d'alignement: l'en-tête 'Date' e | docs/qa/screenshots/happy-path.png |
| F7 — Masquage des données identifiantes (redact) | ok | server/redact initialisé avant la db dans start.ts; redact.test.ts et le test de fuite e2e passent. | — |
| F8 — Proxy de sortie et journal | ok | server/egress (proxy, allowlist, purpose, shipper), proxy embarqué et ProxyAgent global dans start.ts, entrée dist/egress.js; test/integration/egress.test.ts passe. | — |
| F9 — Vue « Ce qui a quitté la machine pour ce scan » | ok | outbound_reads et claude_sessions persistés; ScanOutboundPage routée (/scans/:id/outbound); OutboundSummary dans le rapport; egress-pages.test.tsx vérifie fichiers, octets et extraits dépliables. | — |
| F10 — Page Sorties réseau et divulgation | ok | EgressPage, BlockedAlertBanner (acquitter), badge '7' dans la nav (visible sur la capture), DisclosurePage /disclosure; tests egress-pages passent. | docs/qa/screenshots/happy-path.png |
| F11 — Paramètres : connexion GitHub | ok | settings-gh, device-parse, routes /api/settings/github/*; SettingsPage affiche le code d'appareil; settings-gh.test.ts passe. | — |
| F12 — Paramètres : connexion Claude | ok | settings-claude, secrets-store, ws/pty-bridge, XtermConsole dans SettingsPage, clé API PUT/DELETE, revérification; settings-api.test.ts et settings-claude.test.ts passent. | — |
| F13 — Exposition réseau et authentification | ok | assertStartupAllowed dans start.ts, server/auth (scrypt, sessions, CSRF, rate-limit), security-headers.ts; auth.test.ts et startup.test.ts (refus de démarrage) passent. | — |
| F14 — Aucune télémétrie, UI 100 % locale | ok | test/build/dist-no-external.test.ts passe, polices système, aucune dépendance d'analytics. | — |
| F15 — Livrable Docker durci et documentation | partial | Dockerfile multi-stage (UID 10001, versions épinglées), docker-compose.yml (2 services, réseau internal, read_only, cap_drop ALL, no-new-privileges, pas de bind-mount) vérifié par docker-compose.test. | — |
| F16 — États d'interface et robustesse | ok | StateViews (vide, chargement, erreur) utilisé par les pages, erreurs uniformes via api/errors.ts, WsProvider avec backoff et indicateur de connexion; state-views.test.tsx et ws-provider.test.tsx passe | docs/qa/screenshots/error-state.png, docs/qa/screenshots/happy-path.png |
