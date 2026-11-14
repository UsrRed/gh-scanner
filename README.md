# gh-scanner

Scanner de dépôts GitHub assisté par Claude : clone un dépôt dans un bac à sable, l'analyse (analyses locales + sessions Claude en lecture seule), puis produit un rapport (score, verdict, constats). Voir `docs/SPEC.md` et `docs/ARCHITECTURE.md`. Pour le déploiement pas à pas, voir `docs/DEPLOY.md`.

> Ce projet a été généré de bout en bout avec [**pj-gen**](https://github.com/UsrRed/pj-gen), mon orchestrateur qui pilote Claude Code en mode headless (cadrage, spécification, découpage en tâches, implémentation, tests).

## Prérequis

- **Node.js ≥ 22** et npm (pour l'installation sans Docker, le build et les tests).
- **`git`**, **`gh`** (GitHub CLI) et **`claude`** (Claude Code CLI) dans le `PATH` pour les scans réels. Le build et les tests n'en ont pas besoin (faux CLI).
- **Docker Engine + Compose v2** pour le déploiement recommandé.
- `python3`, `make` et `g++` si `node-pty` ou `better-sqlite3` ne trouvent pas de binaire précompilé pour votre plateforme.
- Un compte Claude (abonnement, login depuis les Réglages) ou une clé API Anthropic ; un compte GitHub pour les dépôts privés.

## Installation


### Serveur (Docker, recommandé)

```bash
docker compose up --build -d
```

Deux services : `app` (réseau `internal` uniquement, sans accès Internet) et `egress` (proxy sortant à liste d'autorisation, seul relié au réseau `outside`). L'interface est publiée sur `http://127.0.0.1:8417` : Docker ne publie pas les ports d'un conteneur relié uniquement à un réseau `internal`, c'est donc `egress` qui relaie le port 8417 vers `app` (relais ingress, voir « Limites connues »).

Pour exposer l'interface à distance, placez-la derrière un reverse proxy TLS (Caddy, nginx, Traefik) qui authentifie ou au minimum termine HTTPS, définissez `SCANNER_ADMIN_PASSWORD` et `SCANNER_COOKIE_SECURE=1`. Ne modifiez pas la publication du port en `0.0.0.0` sans retirer `SCANNER_CONTAINER_LOCAL=1` et définir un mot de passe.

### PC (sans Docker)

```bash
npm install
npm run build
npm run start
```

Prérequis : Node.js ≥ 22, `git`, `gh` et `claude` (CLI) dans le `PATH`. Le serveur écoute sur `127.0.0.1:8417` et lance un proxy `egress` embarqué. **Limite** : sans réseau Docker `internal`, rien n'empêche techniquement un sous-processus d'ignorer les variables de proxy ; l'isolation réseau est alors de meilleur effort (variables `HTTPS_PROXY`, environnement minimal) et non garantie par le noyau. Préférez Docker pour analyser des dépôts non fiables.

## Première connexion

1. Ouvrez `http://127.0.0.1:8417` (si un mot de passe est défini, connectez-vous avec `SCANNER_ADMIN_PASSWORD`).
2. **Réglages → GitHub** : lancez la connexion `gh` (code d'appareil), ouvrez l'URL affichée et saisissez le code. Le jeton reste dans le volume de données.
3. **Réglages → Claude** : connectez un compte via la console intégrée, ou renseignez une clé API Anthropic (`ANTHROPIC_API_KEY` ou saisie dans l'interface).
4. Lancez un scan depuis « Nouveau scan » (`owner/name`, référence facultative).

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `SCANNER_HOST` | `127.0.0.1` | Adresse d'écoute ; non-loopback ⇒ mot de passe requis sauf `SCANNER_CONTAINER_LOCAL=1` |
| `SCANNER_PORT` | `8417` | Port d'écoute |
| `SCANNER_DATA_DIR` | `<app>/data` (`/data` dans l'image Docker) | Données (base, réglages, homes des sous-processus) |
| `SCANNER_WORK_DIR` | `<data>/work` | Clones temporaires |
| `SCANNER_ADMIN_PASSWORD` | — | Mot de passe d'administration (haché au premier démarrage) |
| `SCANNER_COOKIE_SECURE` | — | `1` ⇒ cookie de session `Secure` |
| `SCANNER_CONTAINER_LOCAL` | — | Réservé à compose : autorise l'écoute non-loopback sans mot de passe |
| `SCANNER_CONCURRENCY` | `1` | Scans simultanés (1–16) |
| `SCANNER_MAX_REPO_MB` | `200` | Taille maximale d'un dépôt |
| `SCANNER_CLONE_TIMEOUT_S` | `120` | Délai de clonage |
| `SCANNER_SESSION_TIMEOUT_S` | `900` | Délai d'une session Claude |
| `SCANNER_BUDGET_USD` | `2` | Budget en dollars par scan |
| `SCANNER_BUDGET_TOKENS` | `1500000` | Budget en jetons par scan |
| `SCANNER_MAX_TURNS` | `60` | Tours maximum par session |
| `SCANNER_MODEL_ANALYSIS` | `claude-sonnet-5-5` | Modèle de cartographie et d'analyses ciblées |
| `SCANNER_MODEL_SYNTHESIS` | `claude-opus-5-5` | Modèle de synthèse |
| `SCANNER_MODEL_PING` | `claude-haiku-5-5` | Modèle de vérification de la clé |
| `SCANNER_KEEP_CLONES` | `false` | Conserver les clones après analyse |
| `SCANNER_CLAUDE_BIN` | `claude` | Binaire `claude` (`.mjs`/`.js` ⇒ lancé via node) |
| `SCANNER_GH_BIN` | `gh` | Binaire `gh` |
| `SCANNER_GIT_BIN` | `git` | Binaire `git` |
| `SCANNER_SUBPROCESS_PATH` | `/usr/local/bin:/usr/bin:/bin` | `PATH` minimal des sous-processus |
| `SCANNER_EGRESS_URL` | — | Proxy sortant externe (ex. `http://egress:3128`) ; absent ⇒ proxy embarqué |
| `EGRESS_PORT` | `3128` | Port du proxy |
| `EGRESS_HOST` | `0.0.0.0` (egress.js) / `127.0.0.1` (embarqué) | Adresse d'écoute du proxy |
| `EGRESS_ALLOWLIST` | liste de la section « Ce que ce logiciel envoie » | CSV `host[:port]` (port 443 par défaut) |
| `EGRESS_SHARED_DIR` | `$SCANNER_DATA_DIR/egress` | Secret partagé et spool d'événements |
| `EGRESS_APP_URL` | `http://app:8417` | URL de l'app pour le proxy |
| `EGRESS_INGRESS_PORT` | — | Port du relais ingress (Docker) |
| `EGRESS_INGRESS_TARGET` | `app:8417` | Cible du relais ingress |
| `EGRESS_HOST_OVERRIDES` | — | Tests uniquement : `host:port=127.0.0.1:port,…` |
| `ANTHROPIC_API_KEY` | — | Clé API Anthropic (sinon `secrets.json`) |

## Modèle de menaces

- **Dépôt malveillant** : le code n'est jamais exécuté. Le clone est en lecture seule pour Claude (outils `Read`, `Grep`, `Glob` uniquement), chaque appel d'outil est contrôlé (`realpath` contenu dans le clone) ; une violation tue la session et produit un constat `sandbox-violation`. Les liens symboliques sortants sont signalés. Taille et durée sont bornées.
- **Injection de prompt** : le contenu du dépôt est traité comme donnée non fiable ; les tentatives détectées sont signalées (`prompt-injection`). Les outils étant limités à la lecture et le réseau filtré, une injection réussie ne peut ni écrire ni exfiltrer vers une destination hors liste.
- **Fuite d'identité** : environnement des sous-processus reconstruit (jamais hérité de `process.env`), `HOME` dédié, télémétrie désactivée. Noms d'hôte, d'utilisateur, IP, chemins et jetons sont masqués avant stockage, affichage et export.
- **Exfiltration via Claude** : tout trafic sortant passe par le proxy `egress` à liste fermée ; chaque connexion est journalisée (onglet « Sorties ») et toute tentative bloquée déclenche une alerte. Ce que lit Claude est consultable par scan. Claude reçoit néanmoins les extraits qu'il lit : ne scannez pas de dépôt privé dont le contenu ne doit pas quitter la machine.
- **UI exposée** : par défaut l'interface n'écoute qu'en loopback. En cas d'exposition, mot de passe obligatoire, cookie `Secure`, et reverse proxy TLS conseillé (avec éventuellement une authentification supplémentaire et une limitation de débit).

## Limites connues

- **Relais ingress** : le service `egress` relaie le port publié vers `app` (réseau `internal`) ; il voit donc le trafic de l'interface en clair, et publier plus largement ce port expose l'UI.
- **Compose non exécuté en CI** : la configuration `docker-compose.yml` est vérifiée statiquement (tests unitaires) ; un `docker compose up --build` réel n'a pas pu être validé dans l'environnement de build (Docker absent). Lancez-le une fois et vérifiez `http://127.0.0.1:8417` avant tout usage.
- **`statsig` bloqué** : `statsig.anthropic.com` est volontairement hors liste ; le CLI `claude` peut tenter de l'atteindre, ce qui génère une alerte visible sans conséquence fonctionnelle.
- **Base de vulnérabilités commentée** : l'audit des dépendances par base de vulnérabilités externe (OSV, etc.) est désactivé, car il ajouterait une destination sortante ; les dépendances sont analysées localement et par Claude.
- Sur PC, l'isolation réseau n'est pas imposée par le noyau (voir Installation).
- Analyse non exhaustive : l'absence de constat ne prouve pas l'innocuité d'un dépôt.

## Utilisation

Après installation et démarrage (`npm run start`, ou `docker compose up`), ouvrez `http://127.0.0.1:8417`, connectez GitHub et Claude depuis **Réglages**, puis lancez un scan depuis **Nouveau scan**. Le rapport est exportable en Markdown ou en JSON, ou en PDF via le bouton « Exporter en PDF » (impression du navigateur, feuille de style dédiée, sans dépendance), sans données identifiantes.

## Tests

```bash
npm install
npm test
```

- `npm test` lance Vitest (`vitest run`) : tests unitaires, d'intégration, e2e et de composants web. La suite tourne hors ligne, en moins de 60 secondes.
- Aucun appel réel à Claude ni à GitHub : `test/fixtures/fake-claude.mjs` et `fake-gh.mjs` remplacent les CLI via `SCANNER_CLAUDE_BIN` et `SCANNER_GH_BIN`.
- Le test e2e lance le serveur et le proxy en sous-processus, sur des ports dédiés.
- Le dépôt de test est généré à l'exécution ; ses secrets sont factices et construits par concaténation.

## Structure du projet

```
server/     API Fastify, pipeline d'analyse, file, proxy egress, authentification
web/        Interface React (Vite), styles tirés de la maquette docs/design/
shared/     Types partagés serveur/web (types uniquement)
prompts/    Gabarits des prompts Claude (versionnés par prompts/VERSION)
content/    Divulgation sortante : source unique de la section finale de ce README
test/       Fixtures, tests unitaires, d'intégration, e2e et web
docs/       SPEC, ARCHITECTURE (carte du dépôt), INTERFACES, DEPLOY, PROGRESS
Dockerfile, docker-compose.yml   Déploiement durci : services app et egress
dist/       Généré par npm run build (non versionné)
```

Pour localiser un module, consultez `docs/ARCHITECTURE.md`.

# Ce que ce logiciel envoie et à qui

Toute connexion sortante passe par le proxy `egress`, qui n'autorise qu'une liste fermée de destinations. Chaque connexion (autorisée ou bloquée) est journalisée et consultable dans l'onglet « Sorties ».

| Destination | Finalité | Données envoyées | Moment |
|---|---|---|---|
| `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `raw.githubusercontent.com` | Cloner le dépôt à analyser et vérifier la connexion GitHub (`gh`) | Nom du dépôt, référence demandée, jeton GitHub de l'utilisateur (en-tête d'authentification, jamais journalisé) | Au clonage d'un scan et lors de la connexion/vérification GitHub dans les réglages |
| `api.anthropic.com` | Analyse par Claude (CLI `claude`) : cartographie, analyses ciblées, synthèse | Prompts, extraits de fichiers du dépôt lus par Claude (outils Read/Grep/Glob), clé API Anthropic si configurée | Pendant les passes d'un scan et lors de la vérification de la clé |
| `console.anthropic.com`, `claude.ai`, `platform.claude.com` | Connexion du CLI `claude` à un compte (console de login) | Identifiants échangés via le flux OAuth du CLI | Uniquement lors de la connexion depuis les réglages |

## Télémétrie bloquée

`statsig.anthropic.com` et toute autre destination hors liste sont **bloqués** par le proxy (réponse 403). Les variables `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING` et `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` sont positionnées pour les sous-processus. Toute tentative bloquée déclenche une alerte visible dans l'interface.

## Ce qui n'est jamais envoyé

Aucune statistique d'usage, aucun rapport d'erreur, aucune police ou ressource externe. Les secrets détectés sont masqués avant stockage, affichage et export.
