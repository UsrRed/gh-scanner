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
