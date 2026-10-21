PASS: mapping

Passe 1 — cartographie du dépôt {{repo}} (ref: {{ref}}).

Inventaire déterministe (chemins relatifs):
{{inventory}}

Identifie: langages, points d'entrée, manifestes, lockfiles, workflows CI, scripts d'installation (postinstall, setup.py, Makefile, install.sh…) et zones à risque (chemin, raison, catégories concernées).

Réponds par un objet JSON:
{"languages":[],"entryPoints":[],"manifests":[],"lockfiles":[],"ciWorkflows":[],"installScripts":[],"riskZones":[{"path":"","reason":"","categories":[]}]}
