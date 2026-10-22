# Progression

- 2026-10-21T10:25:14.741Z — workspace initialisé
- 2026-10-21T10:42:27.202Z — découpage strictement linéaire — aucune parallélisation possible
- 2026-10-21T10:59:16.959Z — T01 terminé (Config zod, types partagés, repo-input)
- 2026-10-21T11:00:20.238Z — T02 terminé (Module redact et logger)

## T03 — db
- `server/db` : openDb (WAL, migrations v1 idempotentes), repos typés, `createRepos`. Contrat ajouté en INTERFACES §10 (`Db` = `{raw, tx, close}`).
- Note: `npm rebuild better-sqlite3` requis si le binding natif est absent.
- 2026-10-21T11:02:20.715Z — T03 terminé (Module db: SQLite, migrations, repositories)
- T04: buildSubprocessEnv/runGh now take `config` in their options (INTERFACES updated); `buildEnv` alias.
- 2026-10-21T11:03:34.115Z — T04 terminé (proc, env-builder, gh-cli)
- 2026-10-21T11:05:05.845Z — T05 terminé (Faux CLI, dépôt fixture, upstream de test, helpers)
- 2026-10-21T11:06:43.987Z — T06 terminé (Socle front: thème maquette, shell, client API, WS, états)
- T07: cloner exposed as `createCloner(config)` factory (INTERFACES updated); fake-gh gained originUrl/cloneMode(huge|slow), verbatim symlinks.
- 2026-10-21T11:09:07.222Z — T07 terminé (Cloner jetable et pré-inventaire)

## T08
- claude-runner ajouté. Contrat complété (non cassé): `initClaudeRunner(config)` requis, `BudgetLike` structurel, `ClaudeRunnerError.violation`. node-pty chargé paresseusement (binaire natif absent en dev → seul spawnLoginPty échoue).
- 2026-10-21T11:11:31.813Z — T08 terminé (claude-runner: sessions contraintes, garde bac à sable, PTY)
- T09: module egress implémenté (proxy CONNECT, allowlist, purpose, shipper+spool, ingress-relay, secret.ts, entrée server/egress.ts). Contrats INTERFACES inchangés; purpose accepte 'scan.<id>.…' et 'scan:<id>:…' (mot de passe = dernier segment après ':').
- 2026-10-21T11:13:24.204Z — T09 terminé (Module egress: proxy CONNECT, allowlist, journal, relais)
- 2026-10-21T11:14:18.936Z — T10 terminé (Module auth: mot de passe, sessions, CSRF, rate-limit)
- T11: WsHub.register is async with optional authorize; EgressLog gains acknowledge/summaryForScan (INTERFACES updated); ws + @types/ws added as devDeps.
- 2026-10-21T11:15:31.198Z — T11 terminé (Hub WebSocket et module egress-log)
- 2026-10-21T11:16:51.161Z — T12 terminé (Analyse locale: détecteurs, extraits, fingerprint, fusion, score)
- 2026-10-21T11:17:54.418Z — T13 terminé (Prompts versionnés, schémas zod, budget)
- T14: runScanPipeline prend {scan,config,deps:{repos,cloner},signal,emit} et renvoie ScanOutcome (INTERFACES §3 mis à jour; remplace PipelineContext). Le pipeline persiste lui-même statuts/findings/sessions.
- 2026-10-21T11:20:24.500Z — T14 terminé (Passes d'analyse et pipeline de scan)
- T15: queue implémentée (server/queue/index.ts). Contrat Queue modifié: createQueue({config,db,broadcast,pipeline?,cloner?}), list()/position()/recover() (remplace recoverOnStartup), ws→broadcast. AppError créé dans server/api/errors.ts.
- 2026-10-21T11:21:44.328Z — T15 terminé (Module queue: file, concurrence, annulation, reprise)

- T16: module report livré sous forme de fabrique `createReportService({repos, egressLog})` (au lieu de fonctions libres) ; INTERFACES.md mis à jour.
- 2026-10-21T11:22:57.812Z — T16 terminé (Module report: rapport, comparaison, exports)
- T17: settings-gh (device flow, status, logout, permissions) ajouté; contrat serveur noté dans INTERFACES.md.
- 2026-10-21T11:24:27.386Z — T17 terminé (settings-gh: connexion GitHub device flow)
- T18: settings-claude (secrets-store, console PTY auto-close, verify) + ws/pty-bridge; not yet wired into app (API routes pending).
- 2026-10-21T13:10:56.234Z — T18 terminé (settings-claude: clé API, console PTY, revérification)
- 2026-10-21T13:12:39.435Z — T19 terminé (API: erreurs, en-têtes, routes scans/rapports/meta)

- T20: routes `egress.ts`, `internal.ts`, `settings.ts` (server/api/routes); alias `/api/egress` et `/api/egress/ack` ajoutés (INTERFACES.md §4).
- 2026-10-21T13:14:19.318Z — T20 terminé (API: routes sorties réseau, interne egress, paramètres)

## T21 — Câblage backend
- `server/app.ts` `buildApp({config, db, egressSecret, webDir?})` → Fastify (+ `app.services {queue, egressLog, gh}`), `server/api/index.ts` `registerApi`, `server/start.ts` `startServer(config)` (séquence de démarrage complète), `server/index.ts` (entrée, umask 077).
- Contrat modifié: `shared/ws.ts` gagne `settings.gh_login` / `settings.claude` (déjà dans INTERFACES §5); `registerErrorHandling(app, {notFound?})` pour le fallback SPA.
- L'app installe un `ProxyAgent` global (purpose `app`): ses propres `fetch` locaux doivent utiliser un `Agent` direct (voir test/integration/startup.test.ts).
- Fix: `test/web/api-client.test.ts` ne typait pas (bloquait `npm run build`).
- 2026-10-21T13:17:45.996Z — T21 terminé (Câblage backend: app, index, proxy embarqué, démarrage)
- 2026-10-21T13:19:03.007Z — T22 terminé (Test e2e complet et test de fuite)
- 2026-10-21T13:20:28.380Z — T23 terminé (Front: Nouveau scan, File, Suivi en direct)
- 2026-10-21T13:22:31.408Z — T24 terminé (Front: Rapport, Historique, Comparaison)
- 2026-10-21T13:24:15.208Z — T25 terminé (Front: Sorties réseau, Vue par scan, page de divulgation)
- T26: pages Paramètres/Connexion, XtermConsole, types GhFlow/ClaudeStatus/SettingsView/AuthMe dans shared/api.ts, apiPut, garde d'auth dans App.
- 2026-10-21T13:26:13.189Z — T26 terminé (Front: Paramètres (GitHub, Claude) et Connexion)
- 2026-10-21T13:27:40.317Z — T27 terminé (Câblage front: routes, navigation, intégration finale)
- 2026-10-21T13:28:41.269Z — T28 terminé (Dockerfile et docker-compose durcis)
- T29: README.md en français (installation serveur/PC, variables, menaces, limites) + section divulgation recopiée de content/outbound-disclosure.md (test d'égalité test/unit/readme.test.ts). Aucun contrat modifié.
- 2026-10-21T13:29:41.651Z — T29 terminé (README en français et mise à jour des docs)
- 2026-10-21T13:30:57.387Z — T30 terminé (Finition visuelle: transitions et micro-interactions)
- F15: écart du port publié par egress conservé (contrainte Docker réseau internal); Docker absent de l'environnement, validation compose réelle non faisable; limite ajoutée au README.
- 2026-10-21T13:40:43.991Z — audit: éléments partiels restants (F6, F15) — voir docs/FEATURE_AUDIT.md
- 2026-10-21T13:42:20.110Z — vérification finale OK — prêt à déployer
- 2026-10-21T14:37:42.000Z — `SCANNER_DATA_DIR` : le défaut passe de `/data` à `<app>/data` (résolu en absolu). `npm run start` sur un PC échouait avec `EACCES: permission denied, mkdir '/data'`. L'image Docker fixe toujours `SCANNER_DATA_DIR=/data` (Dockerfile + compose). Contrat mis à jour dans INTERFACES.md.

## T31 — Rafraîchissement visuel
Style global modernisé (tokens.css + bloc « modern refresh » en fin d'app.css) : polices système, palette sobre à accent unique indigo, rayons/ombres/spacing, boutons primaire/secondaire/fantôme, champs, badges en pilules, tableaux, nav sticky translucide. Aucun changement de structure, de contrat ni de ressource externe.
- 2026-10-21T14:51:12.899Z — T31 terminé (Moderniser le design global de l'UI (tokens, shell, composants de base))
- 2026-10-21T14:51:42.704Z — vérification finale OK — prêt à déployer

## T32 — Export PDF
Bouton « Exporter en PDF » (window.print) + bloc @media print dans web/src/styles/app.css; aucun contrat modifié.
- 2026-10-22T12:01:56.247Z — T32 terminé (Export PDF du rapport de scan (impression navigateur, sans dépendance externe))
- 2026-10-22T12:02:32.220Z — vérification finale OK — prêt à déployer
