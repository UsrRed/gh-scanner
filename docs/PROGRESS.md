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
