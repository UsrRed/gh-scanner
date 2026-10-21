# ARCHITECTURE — gh-scanner

> Carte du dépôt. Chaque module de la SPEC a **un dossier** sous `server/` (ou `web/`). Les contrats sont dans `docs/INTERFACES.md`.

## 1. Stack retenue

| Couche | Choix | Raison |
|---|---|---|
| Langage | TypeScript strict (`strict`, `noUncheckedIndexedAccess`), ESM | Imposé par la SPEC |
| Runtime | Node 22 | Imposé ; `WebSocket` global (client e2e), `fetch` natif |
| Serveur HTTP | Fastify 5, `@fastify/websocket`, `@fastify/static`, `@fastify/cookie` | Imposé ; cookie de session et UI statique |
| Base | better-sqlite3 (synchrone, migrations versionnées dans le code) | Imposé ; mono-utilisateur, aucun service |
| Validation | zod (config, entrées API, sorties Claude, export) | Imposé |
| PTY | node-pty (console de login `claude`) | Imposé (F12) |
| Sorties de l'app | undici `ProxyAgent` + `setGlobalDispatcher` | Force tout `fetch` de l'app à passer par `egress` (F8) |
| Front | Vite, React 18, React Router 6, `@xterm/xterm` + `@xterm/addon-fit` | Imposé ; xterm pour la console PTY, embarqué localement |
| CSS | CSS fait main à partir des tokens de la maquette (`docs/design/`) | Fidélité à la maquette, aucune ressource externe (F14) |
| Build serveur | `tsc --noEmit` (typecheck) + `esbuild` (bundle → `dist/index.js`, `dist/egress.js`, `--packages=external`) | Respecte `node dist/egress.js` (F15) malgré le dossier `shared/` commun |
| Tests | Vitest (unit, intégration, e2e), jsdom + Testing Library (composants), `tsx` (le e2e lance serveur et proxy en sous-processus) | Un seul runner, `npm test` < 60 s, hors ligne |

Aucune lib de télémétrie, d'analytics, de CSS externe ni de police distante.

## 2. Structure de fichiers cible

```
package.json                 scripts: build, test, start, start:egress, dev
tsconfig.json                base strict (server + shared + test), noEmit
tsconfig.web.json            front (jsx, dom)
vite.config.ts               root=web, outDir=../dist/web, proxy dev /api,/ws
vitest.config.ts             include test/**/*.test.ts(x), pool forks, testTimeout 20s
Dockerfile                   multi-stage (build → runtime node:22-slim, uid 10001)
docker-compose.yml           services app + egress, réseaux internal/outside
.dockerignore
README.md                    FR : installation, variables, menaces, limites, « Ce que ce logiciel envoie et à qui »
content/
  outbound-disclosure.md     source unique de « Ce que ce logiciel envoie et à qui » (servie par l'UI, recopiée dans le README — test d'égalité)
prompts/
  VERSION                    version des prompts (ex. 1)
  system.md                  consigne anti-injection, outils, obligation JSON
  pass1-mapping.md
  pass2-targeted.md          gabarit commun + sections par lot (secrets, injection, deps, ci, install, quality, prompt-injection)
  pass3-synthesis.md
shared/                      types partagés server/web (type-only)
  types.ts                   Scan, Finding, Usage, EgressEvent, Report…
  api.ts                     corps/réponses API
  ws.ts                      enveloppe et événements WS
server/
  index.ts                   entrée app (→ dist/index.js) : config → redact → db → egress embarqué si besoin → queue.recover → listen
  egress.ts                  entrée proxy (→ dist/egress.js)
  app.ts                     buildApp(deps): FastifyInstance (utilisé par index.ts et les tests)
  paths.ts                   appRoot() (remonte jusqu'à package.json), chemins prompts/content/dist/web
  config/                    module `config`
    schema.ts                schéma zod de toutes les variables
    index.ts                 loadConfig(env), assertStartupAllowed()
  db/                        module `db`
    index.ts                 openDb(), transaction helpers
    migrations.ts            migrations versionnées (SQL en chaînes) + table schema_migrations
    repos/scans.ts  repos/findings.ts  repos/logs.ts  repos/claude-sessions.ts
    repos/outbound.ts  repos/egress-events.ts  repos/auth.ts  repos/kv.ts
  redact/                    module `redact`
    patterns.ts              regex tokens/clés/JWT/PEM/IP
    index.ts                 initRedaction(), redact(), redactDeep(), truncateSecret(), registerSecret()
  env-builder/index.ts       module `env-builder` (liste blanche, aucune variable héritée)
  repo-input/index.ts        module `repo-input`
  proc/spawn.ts              spawnTree() (detached = groupe de processus), killTree(pid) par PID, timeouts
  gh/gh-cli.ts               runGh() : unique lanceur de `gh` (utilisé par cloner et settings-gh)
  cloner/                    module `cloner`
    index.ts                 cloneRepo(), removeClone(), cleanupOrphans()
    inventory.ts             pré-inventaire déterministe (arborescence relative, tailles, manifestes, binaires/minifiés, symlinks hors clone)
    gitconfig.ts             génère <data>/git/gitconfig (hooksPath=/dev/null, credential gh, submodule/lfs off)
  claude-runner/             module `claude-runner` (SEUL lanceur de `claude`)
    index.ts                 runClaudeSession(), runStructured(), pingClaude()
    args.ts                  construction argv (allowed/disallowed tools, strict MCP, settings permissions)
    stream.ts                parseur stream-json ligne à ligne → RunnerEvent
    sandbox-guard.ts         vérif. de chaque tool_use (outil + realpath dans le clone)
    errors.ts                ClaudeRunnerError + classification (cli_missing, not_authenticated, quota, timeout…)
    pty.ts                   spawnLoginPty() (node-pty)
  analysis/                  module `analysis`
    pipeline.ts              runScanPipeline() : clone → inventaire → détecteurs → passe 1 → passe 2 (lots) → passe 3
    passes/mapping.ts  passes/targeted.ts  passes/synthesis.ts
    prompts.ts               chargement/rendu des gabarits prompts/ (redact appliqué)
    schemas.ts               zod MappingOutput, TargetedOutput, SynthesisOutput
    budget.ts                BudgetTracker (tokens + USD, cumul result/usage)
    detectors/index.ts  detectors/secrets.ts  detectors/ci.ts  detectors/npm-scripts.ts  detectors/prompt-injection.ts
    snippet.ts               extraction d'extrait depuis le clone (≤ 20 lignes, masqué, secrets tronqués)
    fingerprint.ts           sha256(rule|file|snippet normalisé)
    merge.ts                 fusion Claude + local, déduplication (file, line, rule)
    score.ts                 score déterministe
  queue/index.ts             module `queue` (file, concurrence, annulation, reprise)
  egress/                    module `egress` (proxy)
    proxy.ts                 startEgress() : serveur HTTP CONNECT, allowlist, comptage d'octets
    allowlist.ts             parse EGRESS_ALLOWLIST (host[:port], défaut 443), overrides de test
    purpose.ts               décodage Proxy-Authorization → purpose/scanId, repli par hôte
    shipper.ts               HttpShipper (POST vers app, secret partagé) + spool JSONL + rejeu
    ingress-relay.ts         relais TCP 8417 → app:8417 (Docker : publication du port, cf. §6)
  egress-log/index.ts        module `egress-log` (persistance, totaux, alertes, diffusion WS)
  auth/                      module `auth`
    password.ts              scrypt hash/verify, auth.json (600)
    sessions.ts              sessions SQLite, cookie, expiration 12 h
    csrf.ts                  jeton CSRF par session (en-tête X-CSRF-Token)
    rate-limit.ts            5 échecs / 15 min / IP → 429
    index.ts                 registerAuth(app), requireAuth hook (HTTP + upgrade WS)
  settings-gh/
    index.ts                 startLogin(), getFlow(), cancelFlow(), status(), logout(), verifyStoragePermissions()
    device-parse.ts          extraction code + URL de la sortie de `gh auth login`
  settings-claude/
    index.ts                 status(), setApiKey(), deleteApiKey(), verify(), openConsole(), closeConsole()
    secrets-store.ts         secrets.json (600, umask 077)
  report/                    module `report`
    index.ts                 buildReport()
    compare.ts               compareScans()
    export-json.ts           schemaVersion 1, redactDeep
    export-md.ts
  api/                       module `api`
    index.ts                 registerApi(app, deps)
    errors.ts                AppError, handler uniforme { error: { code, message } }
    security-headers.ts      CSP, nosniff, no-referrer, frame-ancestors
    routes/scans.ts  routes/reports.ts  routes/egress.ts  routes/settings.ts  routes/auth.ts  routes/internal.ts  routes/meta.ts
  ws/
    index.ts                 module `ws` : WsHub (broadcast, /ws)
    pty-bridge.ts            /ws/pty/:consoleId (console de login Claude)
  log.ts                     logger applicatif (passe par redact, jamais de stack côté client)
web/                         module `web`
  index.html
  src/
    main.tsx  App.tsx (routes)
    api/client.ts            fetch JSON + CSRF + erreurs uniformes
    ws/WsProvider.tsx        connexion /ws, backoff exponentiel, état (indicateur nav)
    hooks/useApi.ts  hooks/useWsEvent.ts
    styles/tokens.css        variables :root de la maquette (paper, ink, quarantine, sévérités, term…)
    styles/app.css           primitives maquette (.app/.nav/.panel/.btn/.field/.chip/.sev/.tag/.alert/.track/.gauge/.term/.verdict/.stamp/.counters/.finding/tables)
    components/
      AppShell.tsx  Nav.tsx (badge alertes, indicateur WS)  PageHeader.tsx
      StateViews.tsx (EmptyState / LoadingState / ErrorState avec action de reprise)
      SeverityBadge.tsx  SourceTag.tsx  VerdictStamp.tsx  ScoreBlock.tsx  SeverityCounters.tsx
      FindingItem.tsx (details/summary)  FiltersBar.tsx  Pagination.tsx
      StepTrack.tsx (6 étapes)  BudgetGauges.tsx  LogTerminal.tsx  QueueRow.tsx
      EgressTable.tsx  EgressTotals.tsx  BlockedAlertBanner.tsx  UsageTable.tsx  OutboundSummary.tsx
      XtermConsole.tsx  HazardTape.tsx
    pages/
      NewScanPage.tsx  QueuePage.tsx  ScanLivePage.tsx  HistoryPage.tsx  ReportPage.tsx
      ComparePage.tsx  EgressPage.tsx  ScanOutboundPage.tsx  SettingsPage.tsx
      DisclosurePage.tsx  LoginPage.tsx  NotFoundPage.tsx
test/
  fixtures/
    fake-claude.mjs          faux CLI claude (scénarios via $HOME/.fake-claude.json)
    fake-gh.mjs              faux CLI gh (scénarios via $GH_CONFIG_DIR/.fake-gh.json)
    vuln-repo/               gabarit du dépôt fixture (sans secret littéral)
    make-vuln-repo.ts        génère le dépôt git fixture (secrets construits par concaténation)
    echo-upstream.ts         faux serveur amont (TCP/TLS) pour le proxy
  helpers/                   tmpDirs, startTestApp(), waitForStatus(), leak-check (scan de chaînes interdites)
  unit/                      repo-input, redact, env-builder, score, merge, fingerprint, compare, schemas, detectors, device-parse, allowlist, purpose
  integration/               queue (2 scans, annulation, reprise), claude-runner (fake CLI : kill outil interdit / chemin hors clone / JSON invalide / budget), cloner, egress (allow/block/octets/spool), auth (refus démarrage, login, 429, cookie, CSRF), settings (aucun secret), settings-gh, settings-claude (pty)
  e2e/full-scan.e2e.test.ts  serveur + proxy en sous-processus (ports dédiés, arrêt par PID)
  web/*.test.tsx             composants/pages clés (jsdom)
  build/dist-no-external.test.ts   build Vite programmatique dans un dossier tmp puis scan d'URL externes
dist/                        (généré) index.js, egress.js, web/
```

## 3. Modules et responsabilités

| Module | Dossier | Responsabilité | Dépend de |
|---|---|---|---|
| config | `server/config` | Lit/valide toutes les variables (zod), valeurs par défaut, aucune constante en dur | — |
| db | `server/db` | Ouverture SQLite (WAL), migrations, repositories typés | config |
| redact | `server/redact` | Masquage unique des chemins, hôte, utilisateur, IP, tokens ; troncature des secrets du dépôt | config |
| env-builder | `server/env-builder` | Environnement minimal des sous-processus (liste blanche), URL proxy avec finalité | config, redact (registerSecret) |
| repo-input | `server/repo-input` | Validation stricte dépôt/ref | — |
| proc | `server/proc` | spawn tableau d'arguments, `detached` (groupe), kill par PID (`-pgid`), timeouts | — |
| cloner | `server/cloner` | `gh repo clone` jetable, ref, limites taille/délai, symlinks, pré-inventaire | gh, proc, env-builder |
| claude-runner | `server/claude-runner` | Seul lanceur de `claude` (sessions, ping, PTY), garde du bac à sable, budget, erreurs | proc, env-builder, redact, db |
| analysis | `server/analysis` | 3 passes, détecteurs locaux, fusion, score, snippets | claude-runner, cloner, db |
| queue | `server/queue` | File FIFO, concurrence, cycle de vie, annulation < 5 s, reprise au démarrage | analysis, cloner, db, ws |
| egress | `server/egress` | Proxy CONNECT, allowlist exacte, journal, expédition vers app, relais ingress | config |
| egress-log | `server/egress-log` | Persistance, filtres, totaux, alertes/acquittement, WS `egress.event` | db, ws |
| auth | `server/auth` | Mot de passe scrypt, sessions cookie, CSRF, rate-limit, refus de démarrage | config, db |
| settings-gh | `server/settings-gh` | Device flow `gh auth login`, statut, logout, permissions 700/600 | gh, env-builder |
| settings-claude | `server/settings-claude` | Clé API (600), console PTY de login, revérification | claude-runner |
| report | `server/report` | Rapport, comparaison par fingerprint, exports MD/JSON masqués | db, redact |
| api | `server/api` | Routes HTTP, erreurs uniformes, en-têtes de sécurité | tous |
| ws | `server/ws` | Hub `/ws` (événements), pont PTY `/ws/pty/:id` | auth |
| web | `web/` | UI React conforme à la maquette | shared |

Règles transverses :
- `spawn` toujours avec tableau d'arguments, jamais `shell: true`. Si `SCANNER_CLAUDE_BIN`/`SCANNER_GH_BIN` finit par `.mjs`/`.js`, lancé via `process.execPath`.
- `process.umask(0o077)` au démarrage ; fichiers sensibles (`auth.json`, `secrets.json`, `egress/secret`, `gh/`) vérifiés 600/700 au démarrage (corrigés + log si dérive).
- Tout texte persisté (logs, events WS, prompts, findings, exports) passe par `redact()` au point d'écriture (repos `db` et `ws.broadcast`).
- Aucune stack trace côté client : `api/errors.ts` convertit tout en `{ error: { code, message } }` masqué.

## 4. Flux de données

### 4.1 Scan (UC1)
1. `POST /api/scans` → `repo-input.parseRepoInput` (400 sinon) → `queue.enqueue` → ligne `scans` (`queued`) → WS `scan.status` (avec position).
2. Slot libre → `analysis.runScanPipeline` :
   - `cloning` : `cloner.cloneRepo` → `gh repo clone owner/repo <work>/<id> -- --depth=1 --no-tags` (finalité proxy `scan.<id>.clone`), puis `git fetch --depth=1 origin <ref>` + `checkout FETCH_HEAD` si ref. Surveillance taille (poll 1 s) et délai → kill par PID. Vérif `origin` sans token.
   - Pré-inventaire (`inventory.ts`) + détecteurs locaux (sans Claude).
   - `mapping` : passe 1 (Sonnet) avec inventaire masqué → `MappingOutput`.
   - `analyzing` : passe 2, une session par lot (`secrets+deps`, `injection+install-scripts`, `ci-cd`, `quality`, `prompt-injection`), zones issues de la passe 1.
   - `synthesizing` : passe 3 (Opus) sur findings fusionnés → verdict + justification.
   - Fusion/dédup, extraits relus depuis le clone (Claude ne fournit que fichier/ligne), fingerprint, score déterministe.
   - `done` → suppression du clone (sauf conservation). Erreur → `failed` (motif), budget → `budget_exceeded` (rapport partiel).
3. Chaque événement `claude-runner` → `scan.log` / `scan.step` / `scan.usage` + persistance `claude_sessions` et `outbound_reads` (F9).

### 4.2 Session Claude contrainte
`claude -p --output-format stream-json --verbose --model M --allowedTools Read,Grep,Glob --disallowedTools Bash,Write,Edit,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task --strict-mcp-config --mcp-config <data>/claude/empty-mcp.json --settings <data>/claude/sandbox-settings.json --append-system-prompt <system.md> --max-turns N`, prompt via **stdin**, `cwd` = clone, env de `env-builder`.
Chaque `tool_use` → `sandbox-guard` (outil ∈ {Read,Grep,Glob}, `realpath` du chemin ⊂ clone) ; violation → `killTree` immédiat + finding `sandbox-violation`. `tool_result` → taille + extrait masqué en `outbound_reads`. `assistant.usage`/`result` → `BudgetTracker` ; dépassement → kill + `budget_exceeded`. Le fichier `sandbox-settings.json` ajoute des règles de permissions `allow Read(./**)`/`deny` (défense en profondeur, la garde de flux restant la référence).

### 4.3 Sorties réseau
Sous-processus → `HTTPS_PROXY=http://<purpose>:x@<egress>` → `egress` (CONNECT, hôte exact + port 443, sinon 403 `blocked`) → événement `EgressEvent` à la fermeture → `HttpShipper` (`POST /internal/egress/events`, en-tête `X-Egress-Secret`) ou sink direct (mode embarqué) → `egress-log.ingest` → SQLite + WS `egress.event` + alerte si bloqué. App indisponible → `spool.jsonl` rejoué toutes les 5 s.

### 4.4 Modes de lancement
- **Docker** : `app` (réseau `internal` seul, `SCANNER_EGRESS_URL=http://egress:3128`) ; `egress` (réseaux `internal` + `outside`, `node dist/egress.js`) avec relais ingress `127.0.0.1:8417 → app:8417` (cf. §6).
- **PC** (`npm run start`) : sans `SCANNER_EGRESS_URL`, `server/index.ts` démarre le proxy **embarqué** sur `127.0.0.1:EGRESS_PORT` (sink direct). Le proxy n'est alors imposé que par l'environnement des sous-processus (limite documentée).
- `undici.setGlobalDispatcher(new ProxyAgent(egressUrl))` au démarrage de l'app : tout `fetch` de l'app passe par `egress` (finalité `app`).

### 4.5 Connexions (Paramètres)
- GitHub : `POST /api/settings/github/login` → `gh auth login --hostname github.com --git-protocol https --web` (BROWSER neutralisé, finalité `settings.gh-login`) → `device-parse` → WS `settings.gh_login` (code + URL) → statut via `gh auth status` + `gh api user`. Délai 15 min.
- Claude : console PTY (`claude-runner.spawnLoginPty`, pont `/ws/pty/:id`, fermeture auto sur détection de `<claude-home>/.claude/.credentials.json` ou 15 min) ; ou clé API (`secrets.json`, jamais renvoyée ; affichage `sk-ant-…abcd`) ; « Revérifier » → `pingClaude()`.

## 5. Front (fidélité maquette `docs/design/`)
- Shell : grille `216px | 1fr`, nav sombre (`--ink`) avec marque « quarantaine », liens mono, badge rouge clignotant pour alertes non acquittées, pied de nav = indicateur WS (`.dot.live/.warn/.bad`) et état connexions.
- Thème : tokens `:root` de la maquette dans `tokens.css` (papier, encre, `--quarantine`, couleurs de sévérité + fonds, `--term`), polices **système** uniquement (`--mono`, `--sans`).
- Pages ↔ composants : Nouveau scan (`.field`, validation inline `.err`) ; File/Suivi (`QueueRow` + `.pos`, `ScanLivePage` : `.scan-card`, `StepTrack` 6 étapes, `BudgetGauges`, `LogTerminal`) ; Rapport (`VerdictStamp` tampon tourné, `ScoreBlock` + formule, `SeverityCounters` 5 colonnes, `FiltersBar` chips, `FindingItem` details, `UsageTable`, `OutboundSummary`) ; Comparaison (nouveaux/résolus/persistants, delta de score) ; Sorties réseau (`BlockedAlertBanner` + bouton acquitter, `EgressTotals` barres, `EgressTable` lignes `.blocked`/`.fresh`) ; Vue par scan (fichiers + octets + extraits) ; Paramètres (GitHub device code, Claude console xterm / clé API) ; Ce que ce logiciel envoie (rendu de `content/outbound-disclosure.md`).
- Chaque page utilise `StateViews` (vide / chargement / erreur + « Réessayer »).
- CSP `default-src 'self'` : pas de style inline dynamique hors attribut `style` React (autorisé via `style-src 'self' 'unsafe-inline'` limité aux styles — à défaut, largeurs de barres via attributs `data-*` et classes) ; aucun `eval`.

## 6. Docker
- `Dockerfile` : stage `build` (node:22-slim + python3/make/g++ pour node-pty/better-sqlite3, `npm ci`, `npm run build`, `npm prune --omit=dev`) ; stage `runtime` node:22-slim, `git` (apt, version épinglée), `gh` (tarball officiel épinglé + vérif sha256), `npm i -g @anthropic-ai/claude-code@<version épinglée>`, utilisateur `scanner` UID 10001, `ENV` télémétrie (F14), `CMD ["node","dist/index.js"]`.
- `docker-compose.yml` : volumes nommés `scanner-data` (app, `/data`) et `egress-shared` (app + egress, `/shared` : secret partagé + spool uniquement — egress n'accède pas aux tokens) ; `read_only`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `no-new-privileges:true`, `user: "10001"`, aucun bind-mount ni `docker.sock`, pas d'`env_file`.
- **Publication du port** : Docker ne publie pas les ports d'un conteneur relié uniquement à un réseau `internal: true`. Le service `egress` porte donc `ports: ["127.0.0.1:8417:8417"]` et relaie en TCP vers `app:8417` (`EGRESS_INGRESS_PORT`/`EGRESS_INGRESS_TARGET`) ; `app` reste sur `internal` seul (`expose: 8417`). Écart documenté dans le README.
- `app` écoute sur `0.0.0.0` dans le conteneur avec `SCANNER_CONTAINER_LOCAL=1` (publication limitée à 127.0.0.1 par compose) ; retirer ce drapeau / publier ailleurs exige `SCANNER_ADMIN_PASSWORD`.

## 7. Tests (`npm test` = `vitest run`, hors ligne, < 60 s)
- Faux CLI : `fake-claude.mjs` lit son scénario dans `$HOME/.fake-claude.json` (l'env étant en liste blanche) et le prompt (marqueur `PASS:`) ; ouvre de vraies connexions CONNECT via `HTTPS_PROXY` vers `api.anthropic.com:443` (redirigé par `EGRESS_HOST_OVERRIDES` vers `echo-upstream`) et `statsig.anthropic.com` (bloqué → alerte). `fake-gh.mjs` copie le dépôt fixture (`git init` + commit) et simule le device flow.
- Dépôt fixture généré à l'exécution (`make-vuln-repo.ts`) : secret factice construit par concaténation, `.github/workflows/pr.yml` en `pull_request_target` + checkout de la PR, `package.json` avec `postinstall` `curl … | sh`, README contenant une injection de prompt.
- Test de fuite (`helpers/leak-check.ts`) : variable piège `HOST_SECRET`, `os.hostname()`, `os.userInfo().username`, chemins data/work, token simulé — recherchés dans la DB, les logs, les events WS capturés et les exports.
- `build/dist-no-external.test.ts` : `vite.build()` programmatique vers un dossier tmp puis scan `src=|href=|@import|url(` vers `http(s)://` externe.

## 8. Dépendances

Runtime (`dependencies`) : `fastify`, `@fastify/websocket`, `@fastify/static`, `@fastify/cookie`, `better-sqlite3`, `zod`, `node-pty`, `undici`.
Front, embarquées par Vite (`devDependencies`) : `react`, `react-dom`, `react-router-dom`, `@xterm/xterm`, `@xterm/addon-fit`.
Outillage (`devDependencies`) : `typescript`, `esbuild`, `tsx`, `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@types/node`, `@types/better-sqlite3`, `@types/react`, `@types/react-dom`.
Volontairement absents : helmet, rate-limit, CSRF tiers (implémentés en < 100 lignes dans `auth`/`api`), ORM, lib d'UI/CSS, client WS (WebSocket natif Node 22), lib d'ID (`crypto.randomUUID`).

## 9. Scripts npm
- `build` : `tsc -p tsconfig.json && tsc -p tsconfig.web.json && esbuild server/index.ts server/egress.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outdir=dist && vite build`
- `test` : `vitest run`
- `start` : `node dist/index.js` ; `start:egress` : `node dist/egress.js`
- `dev` : `tsx watch server/index.ts` (+ `vite` sur un port dédié)


## Stack
```json
{
  "language": "TypeScript (Node 22, ESM, strict)",
  "framework": "Fastify 5 + React 18 (Vite) ",
  "package_manager": "npm",
  "install_cmd": "npm install",
  "build_cmd": "npm run build",
  "test_cmd": "npm test",
  "run_cmd": "npm run start"
}
```

## Risques
- Docker ne publie pas les ports d'un conteneur relié uniquement à un réseau internal:true : la publication 127.0.0.1:8417 passe par un relais TCP dans le service egress (écart à documenter) ; le rate-limit par IP voit alors l'IP du relais.
- Dans le conteneur, app écoute sur 0.0.0.0 : la règle « hôte non local ⇒ mot de passe » repose sur le drapeau SCANNER_CONTAINER_LOCAL=1 défini par compose ; une publication élargie sans retirer ce drapeau exposerait l'UI sans auth (avertissement au démarrage + README).
- La garde du bac à sable agit sur les événements tool_use du flux : la lecture d'un fichier hors clone peut s'exécuter avant le kill. Atténuation : permissions dans --settings, cwd = clone, HOME isolé, aucun secret lisible dans le conteneur app.
- Corrélation de finalité par identifiants dans HTTPS_PROXY : le CLI claude (undici) ou gh pourraient ne pas transmettre Proxy-Authorization ; repli par nom d'hôte, sans scanId.
- node-pty et better-sqlite3 sont des modules natifs : compilation nécessaire (python3/make/g++) si aucun prebuild ; un échec de node-pty casse la console de login et son test.
- Le format stream-json et les drapeaux du CLI claude (--strict-mcp-config, --settings, --append-system-prompt, champs usage/total_cost_usd) peuvent évoluer : versions épinglées dans l'image, parseur tolérant et testé.
- Masquage des IP et des tokens par regex : risque de faux positifs (numéros de version) ou de faux négatifs ; à couvrir par les tests du module redact.
- Le dépôt fixture contient des secrets factices : ils sont générés par concaténation à l'exécution, sinon la protection de push GitHub bloquerait la publication.
- Temps de la suite (<60 s) : le e2e lance deux sous-processus tsx et le test dist lance un build Vite ; timeouts courts dans les tests et pool forks à surveiller.
