# Déploiement

Ce document décrit comment installer gh-scanner sur la cible. Il s'appuie sur l'inventaire d'accès de `docs/ACCESS.md`. **Aucune valeur de secret n'est écrite ici** : les secrets vivent dans le fichier `.env` local, non versionné.

## 1. Options retenues

| Option | Usage | Isolation réseau | Recommandation |
|---|---|---|---|
| **A. Docker Compose sur un serveur** | Usage courant, dépôts non fiables | Forte : `app` sur réseau `internal` sans accès Internet, seul `egress` sort (liste fermée), conteneurs non-root, `read_only`, `cap_drop: ALL` | **Recommandé** (SPEC, UC6) |
| **B. PC avec `npm run start`** | Évaluation personnelle, dépôts de confiance | Faible : proxy `egress` embarqué, imposé uniquement par l'environnement des sous-processus | Acceptable hors dépôts non fiables |
| **C. Serveur sans Docker** | Hôte sans Docker | Identique à B | À éviter pour des dépôts non fiables |

Dans les trois cas, l'interface écoute sur `127.0.0.1:8417` par défaut. Une exposition réseau exige un mot de passe administrateur (`SCANNER_ADMIN_PASSWORD`) et, en pratique, un reverse proxy TLS devant l'interface.

## 2. Prérequis

- **Commun** : `git` ; accès à GitHub pour cloner (compte GitHub optionnel, nécessaire pour les dépôts privés).
- **A** : Docker Engine et Docker Compose v2.
- **B et C** : Node.js ≥ 22 et npm ; `gh` (GitHub CLI) et `claude` (Claude Code CLI) dans le `PATH` pour les scans réels.
- **Modules natifs** (`node-pty`, `better-sqlite3`) : `python3`, `make` et `g++` si aucun binaire précompilé n'est disponible pour la plateforme (déjà prévu dans l'étape de build de l'image Docker).
- **Authentification Claude** : un compte Claude (abonnement, login du CLI depuis Réglages → Claude) **ou** une clé API Anthropic.

## 3. Variables d'environnement requises

Les noms ci-dessous sont les seules variables sensibles. Les autres variables (`SCANNER_HOST`, `SCANNER_PORT`, `SCANNER_DATA_DIR`, budgets, modèles…) ont des valeurs par défaut documentées dans le README.

| Nom | Obligatoire | Où la définir | Rôle |
|---|---|---|---|
| `SCANNER_ADMIN_PASSWORD` | **Oui** dès que l'interface est exposée au-delà de `127.0.0.1` | `.env` local, puis override Compose (option A) ou export shell (options B/C) | Mot de passe d'administration, haché au premier démarrage |
| `ANTHROPIC_API_KEY` | Non (option) | `.env` local, **ou** saisie dans Réglages → Claude (stockée dans `secrets.json`, mode 600) | Authentifie les sessions `claude` sans login d'abonnement |
| `SCANNER_COOKIE_SECURE` | Recommandée si HTTPS | Override Compose ou export shell | Cookie de session `Secure` (non secret, valeur `1`) |

**Hors variables d'environnement** (aucune variable n'existe pour ces comptes) :

- **Compte Claude** (abonnement) : connexion depuis **Réglages → Claude** (console PTY intégrée). Les vrais scans en ont besoin ; le build et les tests non (faux CLI).
- **Compte GitHub** : connexion depuis **Réglages → GitHub** (device flow `gh auth login`, code affiché dans la page). Indispensable pour les dépôts privés.

## 4. Procédure A — Docker Compose (recommandée)

1. **Sur l'hôte**, installer Docker Engine et Compose v2, puis cloner le dépôt :
   ```bash
   git clone <url-du-depot> gh-scanner && cd gh-scanner
   ```
2. **Créer le fichier `.env`** à la racine (il est ignoré par git ; vérifiez avec `git check-ignore .env`) et restreignez ses droits :
   ```bash
   touch .env && chmod 600 .env
   ```
   Renseignez-y, par nom, uniquement ce qui est nécessaire :
   - `SCANNER_ADMIN_PASSWORD` : obligatoire si l'interface sera joignable autrement que depuis l'hôte lui-même ;
   - `ANTHROPIC_API_KEY` : facultatif (sinon, saisie dans l'interface).
3. **Transmettre les variables au service `app`.** Le `docker-compose.yml` versionné ne transmet **aucune** de ces variables (pas d'`env_file`, pas de substitution). Pour l'exposition distante, créez un fichier **local et non versionné** `docker-compose.override.yml` ; Compose le fusionne automatiquement et lit `.env` pour la substitution :
   ```yaml
   services:
     app:
       environment:
         SCANNER_ADMIN_PASSWORD: ${SCANNER_ADMIN_PASSWORD}
         SCANNER_COOKIE_SECURE: "1"
   ```
   Pour `ANTHROPIC_API_KEY`, préférez la saisie dans l'interface (la clé n'apparaît alors dans aucun fichier de configuration ni dans l'environnement du conteneur).
4. **Démarrer** :
   ```bash
   docker compose up --build -d
   docker compose ps
   ```
   Les services `app` et `egress` doivent être `running`.
5. **Vérifier** l'accès local (la page de connexion s'affiche si un mot de passe est défini) :
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8417/
   ```
6. **Connecter les comptes** dans l'interface : **Réglages → GitHub**, puis **Réglages → Claude**. Lancez ensuite un scan de test sur un dépôt public.
7. **Exposition distante (optionnelle)** : placez un reverse proxy TLS (Caddy, nginx, Traefik) sur l'hôte, qui relaie vers `127.0.0.1:8417`. Ne changez pas la publication du port en `0.0.0.0` sans mot de passe.
8. **Mise à jour** :
   ```bash
   git pull && docker compose up --build -d
   ```
9. **Arrêt** : `docker compose down`. **N'ajoutez pas `-v`** : cela supprime les volumes `scanner-data` (base, `auth.json`, `secrets.json`) et `egress-shared`.

## 5. Procédure B — PC (`npm run start`)

1. Vérifier Node ≥ 22, `git`, `gh` et `claude` dans le `PATH`.
2. Installer et construire :
   ```bash
   npm install
   npm run build
   ```
3. Charger les variables si besoin (`npm run start` **ne lit pas** `.env` lui-même) :
   ```bash
   set -a; . ./.env; set +a
   ```
4. Lancer :
   ```bash
   npm run start
   ```
   Interface : `http://127.0.0.1:8417`. Le proxy `egress` est embarqué sur `127.0.0.1:3128`.
5. Arrêter avec `Ctrl+C`. Si le serveur tourne en arrière-plan, arrêtez-le par son PID (`kill $PID`), jamais par nom de processus.

## 6. Procédure C — serveur sans Docker

Identique à B, avec des dépendances de production uniquement après build :

```bash
npm ci
npm run build
npm prune --omit=dev
```

Le lancement (`npm run start`) se fait sous votre gestionnaire de services. Gardez `SCANNER_HOST=127.0.0.1` derrière un reverse proxy TLS. Si l'écoute sort de la boucle locale, `SCANNER_ADMIN_PASSWORD` devient obligatoire.

## 7. Questions ouvertes

L'inventaire d'accès ne couvre pas les points suivants :

- **Hôte cible** : système d'exploitation, présence de Docker, et nom de domaine ou VPN pour l'accès distant.
- **Reverse proxy TLS** : outil retenu et configuration (non décrits ici).
- **Sauvegarde** : politique pour le volume `scanner-data`, qui contient la base, `auth.json` et `secrets.json` (non chiffrés, protégés par permissions 600), et pour `egress-shared`.
- **Mode d'authentification Claude** : abonnement ou clé API, à arbitrer ; budgets `SCANNER_BUDGET_USD` (défaut 2) et `SCANNER_BUDGET_TOKENS` (défaut 1 500 000) à valider.
- **Changement du mot de passe administrateur** après le premier démarrage : procédure non documentée (le hachage est fait au premier démarrage). À vérifier dans `server/auth/password.ts` avant d'en faire une procédure.
- **Écart Compose / README** : le README demande de définir `SCANNER_ADMIN_PASSWORD`, mais `docker-compose.yml` ne la transmet pas au service `app`. La procédure ci-dessus (override local) contourne le problème ; il faudra l'aligner dans le compose ou le README.
- **Validation Docker** : le premier `docker compose up --build` réel n'a jamais été exécuté (Docker absent de l'environnement de build). À valider sur la cible avant usage.
- **Gestion de service** (systemd ou équivalent) pour l'option C : non définie.
