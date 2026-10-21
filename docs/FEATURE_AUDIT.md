# Audit de conformité — passe 3

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Saisie et validation d'un scan | ok | server/repo-input, NewScanPage, 400 uniforme; le test unitaire repo-input passe. La capture montre la ref '--upload-pack=x' rejetée avec le code invalid_ref affiché en ligne. | docs/qa/screenshots/error-state.png |
| F2 — File, suivi en direct, annulation, reprise | ok | server/queue, WsHub monté dans app.ts, recover() au démarrage; QueuePage et ScanLivePage routées. Les tests d'intégration queue et le e2e passent (npm test: 37 fichiers, 240 tests OK). L'indicateur 't | docs/qa/screenshots/happy-path.png |
| F3 — Clonage jetable et sécurisé | ok | server/cloner (gh-cli, gitconfig, inventory) appelé par le pipeline; test d'intégration cloner OK. | — |
| F4 — Sessions Claude contraintes | ok | claude-runner (args, sandbox-guard, stream, errors) et env-builder en liste blanche; tests runner avec faux CLI OK. | — |
| F5 — Analyse en 3 passes et budget | ok | analysis/pipeline.ts enchaîne passes, détecteurs locaux, fusion, score et BudgetTracker; pipeline et e2e OK. Score 25, coût 0,07 $ et verdict visibles dans l'historique. | docs/qa/screenshots/happy-path.png |
| F6 — Rapport, historique, comparaison, export | partial | server/report, ReportPage, HistoryPage et ComparePage routées; tests OK. Sur la capture, la table d'historique est mal alignée: les en-têtes (Dépôt·Ref, Statut, Verdict, Score, Coût, Date) ne sont pas | docs/qa/screenshots/happy-path.png |
| F7 — Masquage des données identifiantes (redact) | ok | server/redact initialisé avant la db au démarrage; test unitaire redact et test de fuite e2e OK. | — |
| F8 — Proxy de sortie et journal | ok | server/egress (proxy, allowlist, purpose, shipper), proxy embarqué et ProxyAgent global dans start.ts, entrée dist/egress.js; test d'intégration egress (allow, block, octets, spool) OK. | — |
| F9 — Vue « Ce qui a quitté la machine pour ce scan » | ok | outbound_reads et claude_sessions persistés; ScanOutboundPage routée et OutboundSummary dans le rapport; egress-pages.test.tsx vérifie fichiers, octets et extraits dépliables. | — |
| F10 — Page Sorties réseau et divulgation | ok | EgressPage, BlockedAlertBanner avec bouton acquitter, DisclosurePage /disclosure. Le badge '7' est visible dans la navigation sur la capture; la maquette est respectée (nav sombre, papier, tampon). | docs/qa/screenshots/happy-path.png |
| F11 — Paramètres : connexion GitHub | ok | settings-gh, device-parse, routes /api/settings/github/*; SettingsPage affiche le code; test settings-gh OK. | — |
| F12 — Paramètres : connexion Claude | ok | settings-claude, secrets-store, pty-bridge monté dans app.ts, XtermConsole dans SettingsPage, routes clé API et revérification; tests settings-api et settings-claude OK. | — |
| F13 — Exposition réseau et authentification | ok | assertStartupAllowed, registerAuth monté dans app.ts, scrypt, sessions, CSRF, rate-limit, en-têtes de sécurité; tests auth et startup OK. | — |
| F14 — Aucune télémétrie, UI 100 % locale | ok | test/build/dist-no-external.test.ts OK, polices système, aucune dépendance d'analytics. | — |
| F15 — Livrable Docker durci et documentation | partial | Dockerfile multi-stage et docker-compose.yml conformes sur le papier: 2 services, internal:true, read_only, cap_drop ALL, no-new-privileges, user 10001, aucun bind-mount. Écarts: le port 8417 est publ | — |
| F16 — États d'interface et robustesse | ok | StateViews (vide, chargement, erreur) utilisé par les pages, erreurs uniformes via api/errors.ts, WsProvider avec backoff et indicateur de connexion; tests state-views et ws-provider OK. La capture mo | docs/qa/screenshots/error-state.png, docs/qa/screenshots/happy-path.png |
