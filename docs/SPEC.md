# SPEC — gh-scanner

## Objectif
gh-scanner est un scanner de dépôts GitHub auto-hébergeable, sur un serveur ou sur un PC, qui s'appuie sur le CLI `claude` en mode headless. L'utilisateur saisit un dépôt, public ou privé. Le dépôt est cloné dans un espace jetable puis analysé par Claude en plusieurs passes, **sans jamais exécuter le code scanné**. Le résultat est un rapport noté : sécurité, qualité, et réponse à la question « puis-je faire confiance à ce dépôt ou l'installer ? ».

Deux exigences dominent tout le produit :
- **Ne rien exposer** de l'utilisateur ni de la machine hôte.
- **Rendre visible tout ce qui sort** vers l'extérieur : chaque connexion, et ce qui a été envoyé à Claude, fichier par fichier.

## Éléments différenciants (NON NÉGOCIABLES)
Ces éléments doivent être livrés pleinement et être visibles dans le produit final.

1. **Analyse par Claude en mode headless, comme pj-gen.**
   - Le serveur lance `claude -p --output-format stream-json --verbose`, authentifié par l'abonnement de l'utilisateur. Une clé API Anthropic reste possible en option.
   - L'analyse se fait en 3 passes : cartographie, analyses ciblées, synthèse.
   - Le budget (tokens et coût) est suivi et plafonné pour chaque scan.
2. **Le dépôt est traité comme non fiable.**
   - Seuls les outils `Read`, `Grep` et `Glob` sont autorisés, limités au dossier du clone.
   - Sont interdits : Bash, Write, Edit, WebFetch, WebSearch et tout MCP (`--strict-mcp-config` avec une configuration vide).
   - Le code n'est jamais exécuté, installé ni buildé.
   - Le prompt système traite toute instruction trouvée dans le dépôt comme une donnée. Une tentative d'injection de prompt devient un finding de catégorie `prompt-injection`.
3. **Transparence réseau totale.**
   - Un proxy de sortie interne (`egress`) fonctionne avec une allowlist et constitue le **seul point de sortie**.
   - Chaque connexion est journalisée : horodatage, destination, finalité, octets envoyés et reçus, statut, blocage éventuel.
   - Une page « Sorties réseau » présente un journal filtrable, les totaux par destination et des alertes sur les tentatives bloquées.
   - Chaque scan dispose d'une vue « Ce qui a quitté la machine pour ce scan » : fichiers et extraits transmis à Claude, tailles, modèle, tokens.
   - Chaque rapport contient un récapitulatif des sorties.
4. **Aucune exposition de l'utilisateur ni de l'hôte.**
   - Écoute sur `127.0.0.1` par défaut. Une exposition réseau doit être demandée explicitement et rend l'authentification obligatoire.
   - L'environnement des sous-processus (`claude`, `gh`, `git`) est construit explicitement, sans aucune variable héritée de l'hôte.
   - Les chemins absolus, le nom d'hôte, le nom d'utilisateur, les IP, les tokens et les variables d'environnement sont masqués dans les prompts, les logs, les rapports et les exports.
   - Aucune télémétrie, et aucune ressource externe dans l'UI.
5. **Connexions depuis l'interface.**
   - GitHub : `gh auth login` en device flow, avec le code et l'URL affichés dans la page.
   - Claude : login du CLI ou saisie d'une clé API.
   - Les secrets ne sont jamais réaffichés et sont stockés en permissions 600.
   - Le clonage passe par `gh` et son helper de credentials. Aucun token n'apparaît jamais dans une URL, un log ou un rapport.
6. **Déploiement durci par `docker compose up`.**
   - Une seule image, lancée comme deux services : `app` sur un réseau `internal: true`, et `egress` relié aux deux réseaux.
   - Conteneurs non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, aucun montage de l'hôte.
   - README en français : installation, modèle de menaces, limites, et section « Ce que ce logiciel envoie et à qui ».

## Utilisateurs et cas d'usage
**Utilisateur unique :** un développeur ou un administrateur qui évalue des dépôts tiers avant de les utiliser ou de les installer.

- **UC1 :** « Je vais installer `owner/outil` : est-ce sûr ? » L'utilisateur saisit le dépôt, lance le scan, suit sa progression en direct, puis lit la synthèse de confiance et les findings critiques.
- **UC2 :** audit de l'un de ses dépôts privés, après connexion GitHub depuis Paramètres.
- **UC3 :** re-scan d'un dépôt après une mise à jour, puis comparaison avec le scan précédent (findings nouveaux, résolus ou inchangés).
- **UC4 :** vérification de ce qui est sorti de la machine (page Sorties réseau et vue par scan).
- **UC5 :** export du rapport en Markdown ou en JSON pour le partager, sans aucune donnée identifiante.
- **UC6 :** installation sur un serveur avec exposition réseau. Un mot de passe administrateur est alors exigé.

## Fonctionnalités

### F1 — Saisie et validation d'un scan
- Le formulaire accepte une URL `https://github.com/owner/repo(.git)` ou `owner/repo`. La branche, le tag ou le commit (ref) est optionnel, tout comme l'option « conserver le clone ».
- **Critères d'acceptation :**
  - Une validation stricte est faite côté serveur. Le motif est `^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$` et la ref suit `git check-ref-format` ou un SHA hexadécimal.
  - Toute autre entrée (autre hôte, `..`, espaces, option commençant par `-`, URL contenant des identifiants) est rejetée avec un code 400 et un message clair.
  - Un test unitaire couvre au moins 15 cas valides et invalides.

### F2 — File de scans, suivi en direct, annulation
- **Critères d'acceptation :**
  - Le cycle de vie d'un scan est : `queued → cloning → mapping → analyzing → synthesizing → done | failed | cancelled | budget_exceeded`.
  - La concurrence est réglable par `SCANNER_CONCURRENCY` (défaut : 1). Au-delà, les scans attendent dans la file et leur position est affichée.
  - Une WebSocket `/ws` diffuse les événements `scan.status`, `scan.step`, `scan.log`, `scan.usage` et `egress.event`. L'UI se met à jour sans recharger la page.
  - L'annulation tue l'arbre de processus du scan par PID (jamais par nom), supprime le clone et passe le statut à `cancelled` en moins de 5 s.
  - Au redémarrage du serveur, les scans restés `running` sont marqués `failed` (« interrompu ») et leurs clones sont nettoyés.
  - Un test d'intégration couvre l'enchaînement de deux scans, l'annulation et la reprise après redémarrage.

### F3 — Clonage jetable et sécurisé
- **Critères d'acceptation :**
  - Le clonage utilise `gh repo clone owner/repo <dir> -- --depth=1 --no-tags`, suivi d'un checkout de la ref si elle est fournie. Les arguments sont passés sous forme de tableau, jamais via un shell.
  - Le clonage fixe `GIT_TERMINAL_PROMPT=0` et `core.hooksPath=/dev/null`. Il n'y a ni sous-modules, ni LFS, ni hooks. L'URL d'origine reste sans token.
  - Une taille maximale (`SCANNER_MAX_REPO_MB`, défaut 200) et un délai maximal (`SCANNER_CLONE_TIMEOUT_S`, défaut 120) s'appliquent. En cas de dépassement, le scan passe à `failed` avec un motif explicite.
  - Le clone est placé dans `$SCANNER_WORK_DIR/<scanId>` et supprimé à la fin (succès, échec ou annulation), sauf si l'option de conservation est activée.
  - Les liens symboliques pointant hors du clone sont ignorés et signalés.

### F4 — Sessions Claude contraintes
- **Critères d'acceptation :**
  - Le module `claude-runner` est le seul à lancer `claude`, avec `-p`, `--output-format stream-json`, `--verbose`, `--model <m>`, `--allowedTools Read,Grep,Glob`, `--disallowedTools Bash,Write,Edit,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task` et `--strict-mcp-config --mcp-config <fichier vide>`. Le `cwd` est le clone.
  - Le binaire est configurable par `SCANNER_CLAUDE_BIN`, ce qui permet de lui substituer un faux CLI dans les tests.
  - L'environnement est construit sous forme de liste blanche. Il contient uniquement :
    - `PATH` minimal ;
    - `HOME=$SCANNER_DATA_DIR/claude-home` ;
    - `HTTPS_PROXY` et `HTTP_PROXY` vers `egress` ;
    - `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` ;
    - `ANTHROPIC_API_KEY`, seulement si une clé est configurée.

    Un test vérifie qu'aucune variable de `process.env` ne fuit, même avec une variable piège `HOST_SECRET`.
  - Chaque événement `tool_use` du flux est vérifié. Un outil hors liste, ou un chemin `Read`/`Grep`/`Glob` résolu hors du clone, tue immédiatement la session et produit un finding interne « violation du bac à sable ».
  - Le prompt système, versionné dans `prompts/`, contient la consigne anti-injection et l'obligation de répondre en JSON conforme au schéma des findings.
  - La sortie de Claude est validée par un schéma zod. Si elle est invalide, une seule relance est faite, puis l'erreur est explicite.
  - Les erreurs sont gérées : CLI absent, non authentifié, quota atteint, timeout de session (`SCANNER_SESSION_TIMEOUT_S`, défaut 900). Chaque cas produit un message utilisateur distinct.

### F5 — Analyse en trois passes et budget
- **Critères d'acceptation :**
  - **Passe 1, cartographie** (Sonnet 5.5, `SCANNER_MODEL_ANALYSIS`, défaut `claude-sonnet-5-5`). Elle produit :
    - les langages, les points d'entrée, les manifestes et lockfiles, les workflows CI, les scripts d'installation ;
    - la liste des zones à risque.
  - Un **pré-inventaire local et déterministe** est calculé sans Claude : arborescence relative, tailles, manifestes détectés, fichiers binaires ou minifiés. Il est fourni dans le prompt de la passe 1.
  - **Passe 2, analyses ciblées** (Sonnet 5.5), une session par lot de zones :
    - (a) secrets commités ;
    - (b) injections et désérialisation ;
    - (c) dépendances (lockfiles, versions anciennes ou abandonnées, typosquatting), sans base externe ;
    - (d) CI/CD : `pull_request_target` avec checkout de la PR, `${{ github.event.* }}` dans `run:`, permissions larges, actions non épinglées ;
    - (e) scripts `preinstall`/`postinstall`, `setup.py`, code obfusqué, exfiltration ;
    - (f) qualité et maintenabilité ;
    - (g) tentatives d'injection de prompt.
  - Des **détecteurs locaux déterministes** fonctionnent en complément, sans Claude :
    - regex de secrets (clés AWS, `ghp_`, `sk-`, clés privées PEM…) ;
    - `pull_request_target` ;
    - scripts d'installation npm.

    Leurs findings sont fusionnés avec ceux de Claude et dédupliqués par (fichier, ligne, règle).
  - **Passe 3, synthèse** (Opus 5.5, `SCANNER_MODEL_SYNTHESIS`, défaut `claude-opus-5-5`). Elle produit le verdict `trust | caution | do-not-install`, un score de 0 à 100 et une justification.
  - Le score est calculé de façon déterministe à partir des sévérités : base 100, puis −40 par critique, −15 par élevée, −5 par moyenne, −1 par faible, avec un minimum de 0. Le verdict de Claude est affiché à côté du score.
  - Le budget par scan se règle par `SCANNER_BUDGET_USD` (défaut 2) et `SCANNER_BUDGET_TOKENS` (défaut 1 500 000).
    - Les tokens et le coût sont cumulés depuis les événements `result` et `usage` du flux.
    - Au dépassement, la session en cours est arrêtée et aucune nouvelle passe n'est lancée. Le statut devient `budget_exceeded` avec un rapport partiel.
  - L'UI affiche les tokens (entrée, sortie, cache) et le coût par passe et par scan.

### F6 — Rapport, historique, comparaison, export
- **Critères d'acceptation :**
  - Un finding contient : `id`, `severity` (critical / high / medium / low / info), `category`, `title`, `file` (chemin relatif), `line`, `snippet` (masqué, 20 lignes au maximum), `explanation`, `fix`, `source` (claude / local), et une `fingerprint` stable (hash de la règle, du fichier et de l'extrait normalisé).
  - La page rapport présente : le verdict, le score, des compteurs par sévérité, des filtres par sévérité et par catégorie, la consommation (tokens et coût) et le récapitulatif des sorties réseau du scan.
  - L'historique liste les scans avec filtre par dépôt, statut et date, et pagination.
  - La comparaison de deux scans d'un même dépôt classe les findings en nouveaux, résolus ou persistants (par `fingerprint`) et montre l'évolution du score.
  - L'export est disponible en Markdown et en JSON.
    - Le JSON suit un schéma versionné (`schemaVersion`).
    - Un test vérifie qu'un export ne contient ni `SCANNER_DATA_DIR`, ni `SCANNER_WORK_DIR`, ni le nom d'hôte, ni le nom d'utilisateur, ni un token simulé.

### F7 — Masquage des données identifiantes (module `redact`)
- **Critères d'acceptation :**
  - Une fonction unique `redact(text)` s'applique aux prompts, aux logs persistés, aux events WS, aux rapports et aux exports.
  - Elle remplace :
    - les chemins du clone et des données par `<repo>/…` et `<data>` ;
    - le nom d'hôte, le nom d'utilisateur et les IP privées ou publiques (hors exemples du dépôt cité) ;
    - les tokens et clés (`gh[pousr]_…`, `github_pat_…`, `sk-ant-…`, `AKIA…`, JWT, PEM) par `[REDACTED:<type>]`.
  - Les secrets trouvés dans le dépôt sont affichés tronqués (4 premiers caractères suivis de `…`), jamais en entier.
  - Un test unitaire couvre chaque motif, ainsi que l'absence de faux positifs sur 5 textes ordinaires.

### F8 — Proxy de sortie et journal des connexions
- **Critères d'acceptation :**
  - Le module `egress` est un proxy HTTP CONNECT en Node, lancé par la même image avec une autre commande et écoutant sur `EGRESS_PORT` (défaut 3128).
  - L'allowlist se règle par `EGRESS_ALLOWLIST`. Par défaut, elle contient : `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `raw.githubusercontent.com`, `api.anthropic.com`, `console.anthropic.com`, `claude.ai`, `statsig.anthropic.com` (bloqué par défaut ; voir Hors périmètre, à documenter), `platform.claude.com`.
  - Correspondance exacte de l'hôte et port 443 uniquement. Toute autre destination reçoit une réponse 403 et est journalisée `blocked=true`.
  - Chaque connexion est journalisée avec : horodatage de début et de fin, hôte, port, octets envoyés et reçus, durée, statut, `blocked`, et finalité.
    - La finalité est déduite d'un en-tête `Proxy-Authorization` de corrélation : chaque sous-processus reçoit dans son `HTTPS_PROXY` un identifiant opaque du type `scan:<id>:clone`, `scan:<id>:claude`, `settings:gh-login`… L'hôte suffit en repli.
  - Le proxy ne déchiffre pas le TLS.
  - Le journal est envoyé à `app` par une API interne authentifiée par un secret partagé généré dans le volume. Si `app` est indisponible, il est écrit en JSONL sur disque puis rejoué.
  - L'application elle-même (Fastify, appels sortants éventuels) n'a aucun accès direct : tout `fetch` sortant passe par un agent proxy.
  - Des tests d'intégration lancent le proxy sur un port local et vérifient trois cas : connexion autorisée vers un faux serveur TLS en allowlist de test, blocage d'un hôte hors liste, et journalisation des octets.

### F9 — « Ce qui a quitté la machine pour ce scan »
- **Critères d'acceptation :**
  - Pour chaque session Claude, l'application persiste :
    - le modèle, la passe, le prompt envoyé (après masquage), sa taille ;
    - chaque `tool_use` `Read`/`Grep`/`Glob` avec le chemin relatif, les lignes ou le motif, et la taille du contenu retourné (issu du `tool_result`) ;
    - les tokens.
  - La vue par scan affiche :
    - la liste des fichiers transmis, avec le nombre d'octets et les extraits consultables ;
    - le total des octets envoyés à Anthropic, avec le nombre de connexions et les volumes vus par le proxy ;
    - les connexions GitHub du clone.
  - Le rapport et les exports incluent un résumé : nombre de fichiers, octets, destinations, connexions bloquées.

### F10 — Page « Sorties réseau »
- **Critères d'acceptation :**
  - Le journal est paginé et filtrable par destination, finalité, scan, statut (autorisé / bloqué) et période.
  - Des totaux par destination sont affichés : connexions, octets envoyés et reçus.
  - Une alerte (bandeau et badge dans la navigation) apparaît dès qu'une connexion a été bloquée depuis le dernier acquittement, avec un bouton « acquitter ».
  - La mise à jour est en direct via WS.
  - Une page statique « Ce que ce logiciel envoie et à qui » est servie dans l'UI, avec le même contenu que la section du README.

### F11 — Paramètres : connexion GitHub
- **Critères d'acceptation :**
  - Le bouton « Se connecter » lance `gh auth login --hostname github.com --git-protocol https --web` avec `GH_CONFIG_DIR=$SCANNER_DATA_DIR/gh`, `GH_NO_UPDATE_NOTIFIER=1`, `GH_TELEMETRY=0`, `GH_PROMPT_DISABLED` adapté, et l'environnement minimal. Le code à usage unique et l'URL `https://github.com/login/device` sont extraits de la sortie et affichés.
    - Le navigateur ne s'ouvre pas côté serveur : `BROWSER` est neutralisé.
  - L'état de connexion est suivi en direct (en attente, connecté, expiré, erreur), avec un délai maximal de 15 min et un bouton d'annulation.
  - Le statut affiché provient de `gh auth status` et de `gh api user` : connecté ou non, login, scopes. Le token n'est jamais affiché (`gh auth status` est lancé sans `--show-token`).
  - La déconnexion utilise `gh auth logout`.
  - Le stockage se trouve dans `$SCANNER_DATA_DIR/gh`, en permissions 700 pour le dossier et 600 pour les fichiers, ce qui est vérifié au démarrage.
  - Le clonage utilise le même `GH_CONFIG_DIR`, et `git` passe par `gh auth git-credential`.

### F12 — Paramètres : connexion Claude
- **Critères d'acceptation :**
  - **Option A, login du CLI.**
    - Une console PTY embarquée (node-pty et xterm.js, servis localement) lance `claude` avec `HOME=$SCANNER_DATA_DIR/claude-home`, sur le modèle de pj-gen.
    - L'utilisateur exécute `/login` et suit l'URL affichée.
    - La console est fermée automatiquement après la connexion ou au bout de 15 min.
  - **Option B, clé API.**
    - Le champ de saisie est en lecture seule après enregistrement. Seul « sk-ant-…xxxx » (les 4 derniers caractères) est affiché.
    - La clé est stockée dans `$SCANNER_DATA_DIR/secrets.json`, en permissions 600.
    - Un bouton « Supprimer » est disponible.
  - Le bouton « Revérifier » lance une session minimale (`claude -p "ping"` avec `--max-turns 1` et un modèle léger) et affiche « opérationnel », « non authentifié » ou une erreur avec son message (masqué).
  - Aucune route API ne renvoie jamais un secret en clair. Un test d'intégration vérifie la réponse de `GET /api/settings`.

### F13 — Exposition réseau et authentification
- **Critères d'acceptation :**
  - `SCANNER_HOST` vaut `127.0.0.1` par défaut. Toute autre valeur, `0.0.0.0` par exemple, exige `SCANNER_ADMIN_PASSWORD`. Sans lui, le serveur refuse de démarrer avec un message clair.
  - Le mot de passe est haché en scrypt au premier démarrage et stocké dans le volume. La variable peut ensuite être retirée.
  - La session passe par un cookie `HttpOnly`, `SameSite=Strict`, `Secure` si `SCANNER_COOKIE_SECURE=1`, avec une expiration de 12 h. Un jeton CSRF protège les mutations. La WS est authentifiée par le même cookie.
  - Les tentatives de connexion sont limitées à 5 échecs par 15 min et par IP, puis renvoient une erreur 429.
  - En mode local (`127.0.0.1`), l'authentification est optionnelle : elle est activée si le mot de passe est défini.
  - Des en-têtes de sécurité sont envoyés : CSP stricte (`default-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
  - Des tests d'intégration couvrent le refus de démarrage, le login, le rate-limit, l'accès refusé sans cookie et le CSRF.

### F14 — Aucune télémétrie, UI 100 % locale
- **Critères d'acceptation :**
  - Toutes les ressources (JS, CSS, polices, icônes) sont embarquées dans le build Vite. Un test parcourt `dist/` et échoue s'il trouve une URL `http(s)://` chargée en `src`/`href`/`@import`/`url(` vers un domaine externe.
  - Les variables suivantes sont toujours positionnées dans l'environnement des sous-processus et dans l'image : `DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `GH_TELEMETRY=0`, `GH_NO_UPDATE_NOTIFIER`, `NPM_CONFIG_UPDATE_NOTIFIER=false`, `NO_UPDATE_NOTIFIER`, `DO_NOT_TRACK=1`.
  - Aucune bibliothèque de télémétrie ou d'analytics ne figure dans les dépendances.

### F15 — Livrable Docker durci et documentation
- **Critères d'acceptation :**
  - Le `Dockerfile` est multi-stage : build du front et du back, puis image d'exécution `node:22-slim` avec `git`, `gh` et `@anthropic-ai/claude-code` installés à des versions épinglées. L'utilisateur `scanner` a l'UID 10001.
  - Le fichier `docker-compose.yml` définit :
    - **service `app` :**
      - réseau `internal` (avec `internal: true`) uniquement ;
      - `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `user: 10001` ;
      - volume nommé `scanner-data` monté sur `/data`, contenant à la fois les données et le dossier de travail ;
      - port interne `8417`, publié par `127.0.0.1:8417:8417` par défaut ;
      - aucun bind-mount de l'hôte ni `docker.sock`, et `env_file` absent par défaut.
    - **service `egress` :** même image, commande `node dist/egress.js`, réseaux `internal` et `outside`, mêmes durcissements.
  - Le serveur fonctionne également hors Docker (`npm run start`) pour une installation sur PC. Le README précise alors les limites : sans réseau `internal`, le proxy n'est pas imposé par le système et son usage repose sur l'environnement des sous-processus.
  - Le README est en français. Il couvre :
    - l'installation sur serveur et sur PC ;
    - la première connexion (GitHub, Claude) ;
    - les variables d'environnement (tableau complet) ;
    - le modèle de menaces : dépôt malveillant, injection de prompt, fuite d'identité, exfiltration via Claude, compromission de l'UI exposée ;
    - les limites connues ;
    - la section « Ce que ce logiciel envoie et à qui », qui présente chaque destination, sa finalité, les données envoyées et le moment où elles le sont.

### F16 — États d'interface et robustesse
- **Critères d'acceptation :**
  - Chaque vue affiche des états vides, de chargement et d'erreur explicites, avec une action de reprise. Les vues concernées sont : Nouveau scan, File/Suivi, Historique, Rapport, Comparaison, Sorties réseau, Vue par scan, Paramètres, Ce que ce logiciel envoie.
  - Les erreurs d'API suivent un format uniforme `{ error: { code, message } }`, avec un message masqué et jamais de stack trace côté client.
  - La WS se reconnecte automatiquement avec backoff, et un indicateur de connexion est affiché.

## Contraintes techniques
- **Stack :** TypeScript strict, Node 22, Fastify, better-sqlite3 (migrations versionnées), zod, `@fastify/websocket`, node-pty. Front : Vite, React, React Router. Tests : Vitest pour l'unitaire et l'intégration, plus un e2e intégré à `npm test`.
- **Modules aux frontières explicites :** chacun expose une interface documentée dans `docs/INTERFACES.md`.
  - `config` : lecture et validation zod des variables d'environnement, aucune constante en dur.
  - `db` : accès SQLite.
  - `redact` : masquage des données identifiantes.
  - `env-builder` : construction de l'environnement minimal des sous-processus.
  - `repo-input` : validation des dépôts saisis.
  - `cloner` : clonage jetable.
  - `claude-runner` : seul module qui lance `claude`.
  - `analysis` : passes, détecteurs locaux, fusion, score.
  - `queue` : file de scans.
  - `egress` : proxy de sortie et journal.
  - `egress-log` : persistance du journal des connexions.
  - `auth` : authentification et sessions.
  - `settings-gh` : connexion GitHub.
  - `settings-claude` : connexion Claude.
  - `report` : rapport, comparaison, export.
  - `api` : routes HTTP.
  - `ws` : diffusion temps réel.
  - `web` : front.
- **Variables d'environnement :**

  | Variable | Défaut |
  |---|---|
  | `SCANNER_HOST` | `127.0.0.1` |
  | `SCANNER_PORT` | `8417` |
  | `SCANNER_DATA_DIR` | `/data` |
  | `SCANNER_WORK_DIR` | `/data/work` |
  | `SCANNER_ADMIN_PASSWORD` | aucun |
  | `SCANNER_COOKIE_SECURE` | — |
  | `SCANNER_CONCURRENCY` | `1` |
  | `SCANNER_MAX_REPO_MB` | `200` |
  | `SCANNER_CLONE_TIMEOUT_S` | `120` |
  | `SCANNER_SESSION_TIMEOUT_S` | `900` |
  | `SCANNER_BUDGET_USD` | `2` |
  | `SCANNER_BUDGET_TOKENS` | `1500000` |
  | `SCANNER_MODEL_ANALYSIS` | `claude-sonnet-5-5` |
  | `SCANNER_MODEL_SYNTHESIS` | `claude-opus-5-5` |
  | `SCANNER_KEEP_CLONES` | `false` |
  | `SCANNER_CLAUDE_BIN` | — |
  | `SCANNER_GH_BIN` | — |
  | `SCANNER_EGRESS_URL` | — |
  | `EGRESS_PORT` | `3128` |
  | `EGRESS_ALLOWLIST` | voir F8 |
  | `ANTHROPIC_API_KEY` | optionnelle |

- **Tests sans Docker ni réseau ni compte :**
  - `npm test` doit passer sur une machine sans Docker, sans accès Internet et sans authentification `claude` ni `gh`.
  - `claude` et `gh` sont remplacés par des faux CLI Node (`test/fixtures/fake-claude.mjs`, `fake-gh.mjs`) choisis via `SCANNER_CLAUDE_BIN` et `SCANNER_GH_BIN`. Ils rejouent des flux stream-json scénarisés : succès, outil interdit, chemin hors clone, JSON invalide, dépassement de budget, injection.
  - Le « clone » des tests est un dépôt git local fixture contenant des failles plantées : secret factice, workflow `pull_request_target`, `postinstall` suspect, fichier README contenant une injection de prompt.
- **e2e :** un test démarre le serveur et le proxy sur des ports dédiés, puis parcourt l'API et la WS : création du scan, suivi jusqu'à `done`, vérification du rapport, de l'export, du journal de sortie et de l'absence de fuites. Les processus sont arrêtés par PID. Un test UI avec Playwright est optionnel s'il est disponible ; sinon, des tests de composants React avec Testing Library sont faits sur les vues clés.
- **Sécurité des processus :** `spawn` utilise des tableaux d'arguments (jamais `shell: true`), avec un groupe de processus par scan pour l'annulation. Les fichiers sensibles sont créés avec `umask 077`.
- **Contraintes générales :** aucun service payant en dehors de l'usage Claude de l'utilisateur, aucune dépendance réseau au runtime en dehors de l'allowlist. Ne pas modifier `.github/workflows/*`.

## Hors périmètre
- Multi-utilisateurs, rôles, SSO/OAuth propre à l'application.
- Base de vulnérabilités externe (osv.dev, GitHub Advisory API). Une simple entrée commentée dans la documentation suffit pour une activation future.
- Exécution dynamique, sandbox d'exécution, build ou installation du dépôt scanné.
- Dépôts hors GitHub (GitLab, Bitbucket), GitHub Enterprise Server, sous-modules et LFS.
- Inspection TLS (MITM) du trafic : le contenu envoyé à Claude est tracé côté application.
- Scans planifiés, webhooks, notifications par e-mail, intégration CI.
- Déploiement sur un serveur distant, nom de domaine, certificats TLS. Le README conseille un reverse proxy en cas d'exposition.
- Le domaine `statsig.anthropic.com` et tout autre domaine de télémétrie sont **bloqués par défaut**. Leurs tentatives apparaissent comme alertes « bloqué » : c'est la preuve visible que la télémétrie ne sort pas.

## Critères de terminaison (definition of done)
1. `npm ci && npm run build && npm test` passent hors ligne, sans Docker ni comptes. Les tests unitaires couvrent au minimum `repo-input`, `redact`, `env-builder`, le score et la fusion, la comparaison et la validation zod des sorties Claude. Les tests d'intégration couvrent la file et l'annulation, le `claude-runner` avec le faux CLI (dont le kill sur outil interdit et sur chemin hors clone), le proxy (allow, block, octets), l'authentification et les paramètres (aucun secret renvoyé). Le test e2e réalise un scan complet sur le dépôt fixture.
2. Sur le dépôt fixture, le rapport contient au moins : un secret commité (critique, masqué), `pull_request_target` (élevée), le `postinstall` suspect et la tentative d'injection de prompt. Chaque finding a son fichier:ligne, son extrait, son explication et son correctif.
3. Aucune sortie persistée ni exportée ne contient les chemins absolus de données ou de travail, le nom d'hôte, le nom d'utilisateur, la variable piège `HOST_SECRET` ou un token simulé. Ce point est vérifié par un test.
4. Les pages Sorties réseau et « Ce qui a quitté la machine pour ce scan » affichent des données réelles issues du proxy et du flux Claude, ainsi qu'une alerte en cas de blocage.
5. Les parcours de connexion GitHub (device code affiché) et Claude (console de login, clé API, revérifier) fonctionnent avec les faux CLI, et les secrets ne sont jamais réaffichés.
6. Le serveur refuse de démarrer sur une adresse non locale sans `SCANNER_ADMIN_PASSWORD`.
7. `Dockerfile` et `docker-compose.yml` respectent F15 : deux services, réseau `internal`, durcissements, aucun montage de l'hôte, port 8417 sur 127.0.0.1.
8. Le README en français est complet (installation serveur et PC, variables, modèle de menaces, limites, « Ce que ce logiciel envoie et à qui »). `docs/ARCHITECTURE.md`, `docs/INTERFACES.md` et `docs/PROGRESS.md` sont à jour.
9. Toutes les vues ont leurs états vides, de chargement et d'erreur. Aucune ressource externe ne figure dans le build du front (vérifié par un test).

## Micro-révisions
- T32 (2026-10-22): ajoute un export pdf du scan
- T31 (2026-10-21): le site fait vieux, rend le moderne en terme de design
