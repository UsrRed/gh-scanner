## Domaine
Scanner de sécurité / confiance de dépôts + moniteur de sorties réseau (outil dev/admin, auto-hébergé, sobre).

Note : recherche limitée (2 requêtes). Les valeurs de palette exactes n'ont pas été trouvées dans les sources ; les mentions de couleur ci-dessous sont des conventions générales, pas des valeurs vérifiées.

## Produits de référence

### Snyk
Source : [dev.to](https://dev.to/rahulxsingh/snyk-open-source-vs-snyk-code-key-differences-595k), [appsecsanta](https://appsecsanta.com/sast-tools/snyk-vs-github-advanced-security)
- **Layout :** liste priorisée de vulnérabilités, avec sévérités Critical / High / Medium / Low, et rapport détaillé par issue avec remédiation guidée.
- **Points faibles cités par les utilisateurs :** dashboards lents, mal organisés, surchargés quand il y a des centaines de findings. Il faut donc des filtres forts et de la pagination.

### Socket.dev
Source : [appsecsanta](https://appsecsanta.com/socket)
- **Layout :** vue d'ensemble avec compteurs (dépôts, dépendances, alertes actives) et alertes groupées par priorité, avec indicateurs de sévérité.
- **Pattern :** chiffres clés en tête, puis liste d'alertes. Le résumé précède le détail.

### GitHub code scanning / Security tab
Source : [aikido](https://www.aikido.dev/blog/snyk-vs-github-advanced-security)
- **Layout :** alertes intégrées au dépôt, liste filtrable par état et sévérité, vue de synthèse agrégée. Le style est celui de Primer : neutre, dense, badges de sévérité discrets.
- **Pattern :** fil d'alertes avec filtres en en-tête. C'est un modèle familier pour la cible (développeurs GitHub).

### Little Snitch (Network Monitor)
Source : [Little Snitch](https://little-snitch.app/), [AppleInsider](https://appleinsider.com/articles/23/03/07/little-snitch-55-review-real-time-connection-monitoring), [linuxiac](https://linuxiac.com/popular-macos-network-monitor-little-snitch-arrives-on-linux/)
- **Layout :** liste de connexions en direct, regroupée par domaine ou application, triable par activité, volume ou nom. Diagramme de trafic sur la dernière heure, carte optionnelle. La version Linux est une web app.
- **Interaction :**
  - Une croix rouge clignote sur un blocage.
  - Un panneau « règle correspondante » explique pourquoi une connexion a été autorisée ou refusée.
  - Les modes Alert, Silent allow et Silent deny sont commutables.
  - Un blocage se fait en un clic.
  - Les snapshots permettent d'analyser un état figé.
- **Détail :** niveau de détail réglable dans les alertes, car trop d'informations nuisent à la lisibilité.

## Synthèse : ce que les bons produits font visuellement
- **Résumé d'abord, détail ensuite.** Un verdict ou des compteurs de sévérité en tête (score, badge, chiffres), puis une liste filtrable. Pour gh-scanner : verdict, score et compteurs au-dessus des findings.
- **Sévérité encodée par couleur et par libellé.** Échelle rouge → orange → jaune → bleu/gris, toujours doublée d'un texte (accessibilité). Fond sombre ou neutre, accents réservés aux états critiques.
- **Densité maîtrisée.** Tableaux compacts, police mono pour chemins, hôtes et extraits, police système sans-serif pour l'UI. C'est aussi ce qui convient à une UI 100 % locale, sans police externe.
- **Alertes de blocage très visibles mais non intrusives.** Badge dans la navigation, bandeau avec bouton d'acquittement, indicateur rouge ponctuel (modèle Little Snitch).
- **Regroupement par destination** avec totaux d'octets, et explication du « pourquoi » (autorisé ou bloqué, finalité) sur chaque ligne.
- **Filtres persistants en en-tête et pagination**, pour éviter la surcharge reprochée à Snyk.
- **Flux temps réel** : lignes qui s'insèrent en direct et indicateur d'état de connexion.