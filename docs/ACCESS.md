# Accès requis

Inventaire établi au cadrage. Les **valeurs** des secrets ne figurent PAS ici: elles sont dans le fichier `.env` du workspace, non versionné.

| Clé | Type | Requis | Pourquoi | Variables .env |
|---|---|---|---|---|
| anthropic_api | api_key | non | Option pour authentifier les sessions claude sans passer par le login de l'abonnement. | ANTHROPIC_API_KEY |
| claude_account | other | non | Les vrais scans en ont besoin, mais pas le build ni les tests (ils utilisent un faux CLI). La connexion se fait depuis la page Paramètres et n'a pas de variable d'environnement. | — |
| github_account | other | non | Indispensable pour scanner des dépôts privés et utile pour éviter les limites de débit. La connexion se fait depuis la page Paramètres. | — |
| admin_auth | other | non | Obligatoire dès que l'interface est exposée au-delà de 127.0.0.1 ; il est haché au premier démarrage. | SCANNER_ADMIN_PASSWORD |
