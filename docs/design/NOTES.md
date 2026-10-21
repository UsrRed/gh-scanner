# gh-scanner — Système de design « Poste de douane »

## Parti pris
gh-scanner fonctionne comme un **poste de douane** :
- le dépôt scanné est une marchandise **en quarantaine** ;
- le proxy `egress` est **la frontière** ;
- tout ce qui sort est **déclaré au bordereau**.

La direction visuelle découle de cette métaphore : papier de registre, encre presque noire, ruban de quarantaine jaune et noir, **tampons d'inspection** pour les verdicts, reçus perforés pour les récapitulatifs de sortie. Pas de dégradés décoratifs, pas de flou, pas d'emojis, pas de police externe.

Quatre motifs signature, **obligatoires** dans le produit :
1. **Ruban de quarantaine** (`.tape`, rayures à −45°, jaune et encre de 14 px). Il surmonte le scan en cours et l'écran de connexion. Il ne sert qu'à signaler « contenu non fiable ou zone protégée ».
2. **Tampon de verdict** (`.stamp`). Bordure `4px double`, rotation −7°, mono 800 en capitales. Rouge pour `do-not-install`, ocre pour `caution`, vert pour `trust`. Les mini-tampons (`.mini-stamp`, rotation −3°) s'utilisent dans les listes.
3. **Frontière** (`.frontier`). Trois colonnes : « Cette machine », un mur en tirets marqué par la porte `EGRESS :3128`, puis « Extérieur ». Une flèche pétrole relie chaque destination autorisée ; une destination bloquée porte une croix rouge sur un trait pointillé. Sur mobile, la frontière devient horizontale.
4. **Reçu perforé** (`.receipt`, bords dentelés). Il est réservé aux récapitulatifs « ce qui est sorti » (rapport, mobile).

## Palette (valeurs exactes)
| Jeton | Hex | Usage |
|---|---|---|
| `--paper` | `#F3EFE4` | fond de l'application |
| `--paper-2` | `#EAE4D3` | zones internes, squelettes, zone « machine » |
| `--card` | `#FBF9F3` | panneaux |
| `--ink` | `#1C1B18` | texte, bordures fortes, navigation, boutons primaires |
| `--ink-2` | `#4A4740` | texte secondaire |
| `--ink-3` | `#7A766B` | métadonnées, libellés |
| `--rule` | `#D8D0BC` | lignes de tableau |
| `--rule-strong` | `#B9AF96` | bordures de panneaux |
| `--quarantine` | `#E9B10A` | ruban, focus, nav active, étape en cours (jamais pour du texte sur papier) |
| `--crit` / `--crit-bg` | `#B3261E` / `#F6DCD8` | critique, bloqué, alertes, erreurs |
| `--high` / `--high-bg` | `#C2541A` / `#F7E2D2` | élevée, `budget_exceeded` |
| `--med` / `--med-bg` | `#8C6E00` / `#F3E8C4` | moyenne, verdict `caution` |
| `--low` / `--low-bg` | `#2F6488` / `#DCE7EF` | faible |
| `--info` / `--info-bg` | `#6E6A60` / `#E6E2D7` | info |
| `--ok` / `--ok-bg` | `#2E6B3C` / `#DCEBDD` | autorisé, connecté, `trust` |
| `--petrol` / `--petrol-bg` | `#1F4E5F` / `#D7E4E8` | **sorties réseau** : flèches, barres d'octets, liens |
| `--term` / `--term-ink` | `#151513` / `#D9D4C3` | console, logs, extraits de code |
| fond de page hors application | `#DCD5C2` | — |

Couleurs complémentaires dans le terminal :
- horodatage `#7E7A6E` ;
- sortie et chemin `#8FC1D1` ;
- avertissement `#F0C24A` ;
- erreur `#F08A7E` ;
- secret masqué : `#F0C24A` sur `#3D2A1F`.

Règles d'usage des couleurs :
- La sévérité est **toujours doublée d'un libellé texte** et d'une bordure gauche de 4 px. La couleur seule ne porte jamais l'information.
- Le rouge est réservé au critique, au bloqué et aux erreurs. Le pétrole est réservé à ce qui sort.
- Contraste : toutes les paires texte/fond respectent AA (≥ 4,5:1). Le jaune quarantaine n'est jamais utilisé pour du texte sur papier.

## Typographie (100 % locale, aucune police chargée)
- **Mono, la voix du registre** : `ui-monospace, "SFMono-Regular", "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace`. Elle sert pour les titres, les libellés, les boutons, les chemins, les hôtes, les chiffres, les tableaux de données, les logs et les extraits.
- **Sans, la voix de la prose** : `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Elle sert pour les explications, les justifications et les paragraphes.
- **Échelle :**

  | Élément | Corps / graisse | Particularités |
  |---|---|---|
  | Score | 64 px / 700 (44 px en comparaison, 48 px sur mobile) | `tabular-nums` |
  | Titre de page | 20 px / 700 | capitales, +0,05em |
  | Compteurs | 26 px / 700 | — |
  | Corps | 14 px / 1,5 | — |
  | Tableaux | 13 px | — |
  | Mono secondaire | 12 px | — |
  | Libellés (`h3`, `th`, `label`) | 11–12 px / 700 | capitales, +0,06 à 0,1em |

- Tous les nombres sont en `font-variant-numeric: tabular-nums` et alignés à droite.

## Espacements, rayons, ombres
- Échelle de 4 px : `4, 8, 12, 16, 24, 32, 48` (`--s1` à `--s7`). Padding de la zone principale : 24 px (16 px sur mobile). Padding des panneaux : 16 px. Écart entre panneaux : 16 px. Écart entre sections : 24 px.
- **Rayon : 0 partout.** C'est un registre, pas une app de bulles. Seule exception : les pastilles d'état (`.dot`, 50 %).
- **Aucune ombre portée.** La hiérarchie passe par la bordure : `1px var(--ink)` pour les conteneurs majeurs (application, verdict, scan en cours, frontière) et `1px var(--rule-strong)` pour les panneaux secondaires. Le titre de page est souligné d'un trait `2px var(--ink)`.
- Grilles :
  - mise en page de l'application : 216 px pour la navigation, puis le contenu ;
  - contenu avec colonne latérale : `minmax(0,1fr) 320px` ;
  - points de rupture : 980 px (colonne latérale passée sous le contenu) et 760 px (navigation horizontale, une seule colonne, colonnes `.hide-m` masquées).

## Composants clés
- **Navigation** sur fond encre. L'élément actif a une bordure gauche jaune de 3 px (bordure basse sur mobile). Le badge rouge « Sorties réseau » affiche le nombre de blocages non acquittés. Le pied de navigation indique l'état WS, l'adresse d'écoute et l'egress.
- **Bandeau d'alerte** (`.alert`) : bordure gauche rouge de 6 px, croix, message, boutons « Voir le journal » et « Acquitter ». Il est placé en haut de la zone principale de toutes les pages tant que l'alerte n'est pas acquittée.
- **Piste des étapes** (`.track`) : 6 stations carrées pour `queued → cloning → mapping → analyzing → synthesizing → done`.
  - Une étape terminée est pleine en encre.
  - L'étape en cours est jaune et pulse.
  - Sous chaque station figurent la durée, le modèle ou le lot.
- **Jauges de budget** : graduées tous les 10 %. Le remplissage est en encre, puis en `--high` au-delà de 80 %.
- **Finding** (`<details>`) :
  - ligne : sévérité, titre et `fichier:ligne` en pétrole, tags catégorie et source (`local` en trait plein, `claude` en pointillés) ;
  - dépliage : extrait numéroté sur fond terminal, ligne fautive surlignée, secrets tronqués à 4 caractères suivis de `…`, puis Explication et Correctif sur deux colonnes, puis la fingerprint.
- **Code device GitHub** : un caractère par case de 40 × 52 px, bordure de 2 px, mono 28 px.
- **Secret enregistré** : champ en lecture seule sur `--paper-2`, `sk-ant-…xxxx`, bouton « Supprimer » à côté.
- **Boutons** : mono 12 px en capitales, bordure encre, rayon 0. Le bouton primaire est plein en encre ; le bouton danger a une bordure et un texte rouges. Focus : contour jaune de 2 px avec un décalage de 2 px.

## États (F16)
- **Vide** : lignes de registre (`repeating-linear-gradient` tous les 28 px), une phrase en mono (« Registre vierge. ») et une action principale.
- **Chargement** : squelettes `.skel` qui reproduisent la forme du contenu attendu, avec un balayage de 1,4 s. Pas de spinner centré.
- **Erreur** : boîte à bordure gauche rouge, `code` en mono capitales (`CLAUDE_NOT_AUTHENTICATED`…), message masqué, puis action de reprise (« Relancer », « Ouvrir Paramètres »). Les violations du bac à sable utilisent la variante orange `--high`.
- **WS** : pilule d'état, avec un point vert pulsant (« en direct ») ou un point rouge suivi du texte « reconnexion dans N s (essai k) ».

## Motion
Les animations restent sobres et fonctionnelles. Toutes sont désactivées sous `prefers-reduced-motion: reduce`.

| Élément | Animation | Durée et répétition |
|---|---|---|
| Point « en direct » | halo `pulse` | 2 s, en boucle |
| Étape en cours | carré `pulse-sq` | 1,6 s |
| Nouveau blocage | croix et badge clignotent (`steps(2)`) | 2 à 3 fois seulement, jamais en boucle |
| Nouvelle ligne de journal ou de log | fond `#FFF1B8` qui s'estompe vers transparent | 2,4 s ease-out |
| Insertion de ligne | en haut de liste, sans décaler le défilement de l'utilisateur | — |
| Curseur de terminal | clignotement | 1 s |
| Transitions d'interface | — | ≤ 150 ms, `ease-out` ; aucune animation d'entrée de page |

## Principes d'interaction
1. **Le résumé avant le détail.** Tampon, score et formule déterministe visible, puis compteurs, puis findings filtrables et paginés (25 par page).
2. **Chaque sortie a un « pourquoi ».** Les lignes du journal affichent la finalité (`scan:<id>:claude`…) et la règle appliquée (« allowlist · hôte exact », « hors allowlist → 403 »).
3. **Les filtres vivent en en-tête de liste** sous forme de puces mono et sont conservés dans l'URL.
4. **Tout chiffre de sortie mène au bordereau détaillé** du scan (lien « Bordereau détaillé ▸ »).
5. **Les secrets ne s'affichent jamais en entier** : `[REDACTED:<type>]` dans ce qui est envoyé, `AKIA…` dans les findings, `sk-ant-…xxxx` dans les paramètres.
6. **Les actions destructrices** (Annuler le scan, Supprimer la clé, Se déconnecter) utilisent le style danger et demandent une confirmation en ligne.
