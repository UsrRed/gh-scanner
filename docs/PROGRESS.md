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
