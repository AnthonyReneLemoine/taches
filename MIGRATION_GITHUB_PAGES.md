# Analyse de migration vers GitHub Pages

## 1) État actuel du projet

Le dépôt contient 2 fichiers :

- `index.html` : interface (HTML/CSS/JS) de l'application.
- `Code.gs` : backend Google Apps Script servant l'UI et persistant les tâches dans Google Sheets.

### Architecture actuelle

- **Frontend** : page unique avec Bootstrap (CDN) + logique JS côté navigateur.
- **Backend** : fonctions Apps Script (`getTaches`, `ajouterTache`, `modifierTache`, `basculerStatut`, `supprimerTache`) qui lisent/écrivent dans une feuille Google Sheets.
- **Pont frontend/backend** : appels `google.script.run.*` depuis `index.html`.

## 2) Blocage principal pour GitHub Pages

GitHub Pages héberge du **statique uniquement** (HTML/CSS/JS). 

Le code actuel dépend d'APIs injectées par Apps Script (`google.script.run`) et d'un runtime serveur Apps Script (`doGet`, `SpreadsheetApp`, `HtmlService`). Tel quel, cela ne peut pas fonctionner sur GitHub Pages.

## 3) Dépendances à remplacer

### Côté frontend (`index.html`)

Les opérations CRUD passent par `google.script.run` :

- Chargement des tâches
- Ajout
- Modification
- Bascule de statut
- Suppression

Ces appels doivent être remplacés par :

- soit un stockage local (LocalStorage / IndexedDB),
- soit des appels `fetch()` vers une API externe.

### Côté backend (`Code.gs`)

Les éléments Apps Script suivants ne sont pas compatibles GitHub Pages :

- `doGet()` / `HtmlService`
- `SpreadsheetApp`
- opérations directes sur Google Sheets

## 4) Stratégies de migration possibles

## Peut-on utiliser SQLite hébergé dans le repo GitHub ?

**Réponse courte : non, pas comme vraie base de données en écriture avec GitHub Pages.**

Pourquoi :

- GitHub Pages ne fournit pas de runtime serveur pour exécuter SQLite.
- Les fichiers du repo sont servis en lecture seule côté client (navigateur).
- Un navigateur ne peut pas modifier directement un fichier `.sqlite` dans le repo GitHub.

Ce qui est possible :

- Lire un export statique (JSON/CSV) versionné dans le repo.
- Utiliser SQLite **côté serveur** (ex. API sur Railway/Render/Fly), puis appeler cette API depuis GitHub Pages.

Conclusion pratique :

- Si vous restez en GitHub Pages pur statique : privilégier `localStorage` / `IndexedDB`.
- Si vous voulez SQLite : il faut un backend externe.

## Peut-on utiliser un ou plusieurs fichiers `.json` comme base de données ?

**Oui, mais avec une limite majeure : en GitHub Pages, ces JSON sont pratiques en lecture, pas en écriture persistante côté serveur.**

Cas possibles :

- **JSON statique versionné dans le repo** : bon pour du contenu initial (seed), catalogues, démos.
- **JSON en cache navigateur (`localStorage`/`IndexedDB`)** : possible pour CRUD local par utilisateur.

Limites importantes :

- Le navigateur ne peut pas committer/pusher automatiquement dans le repo GitHub sans backend et sans flux d'authentification complexe.
- Modifier un fichier JSON servi par Pages ne met pas à jour le dépôt distant.
- En multi-utilisateurs, les données divergent rapidement si elles restent locales.

Recommandation :

- Pour un usage **simple perso** : JSON + `localStorage` est acceptable.
- Pour un usage **partagé** : garder JSON uniquement comme seed, puis passer par une API (serverless ou backend) pour la persistance centrale.

## Option A — Migration minimale (100% statique)

**But** : publier vite sur GitHub Pages sans backend.

- Supprimer la dépendance à `google.script.run`.
- Implémenter un module de persistance `storage.js` basé sur `localStorage`.
- Conserver la plupart de la logique d'UI actuelle.

### Avantages
- Très rapide à déployer.
- Gratuit et simple.

### Limites
- Données par navigateur/appareil.
- Pas de synchronisation multi-utilisateur.
- Pas de partage centralisé.

## Option B — Front sur GitHub Pages + API serverless

**But** : garder une persistance distante proche du comportement actuel.

Approches possibles :

- Cloudflare Workers + KV/D1
- Supabase (Postgres + Row Level Security)
- Firebase (Firestore)
- API maison (Render/Railway/Fly) + DB

### Avantages
- Données centralisées.
- Multi-device, authentification possible.

### Limites
- Complexité supérieure.
- Gestion CORS/auth/secrets.

### Proposition serverless recommandée (multi-PC)

Pour ton besoin (utiliser l'app sur plusieurs PC avec les mêmes données), je recommande **Supabase** :

- **Frontend** : `index.html` sur GitHub Pages.
- **Backend serverless** : Supabase (Postgres + API REST auto + Auth).
- **Sécurité** : Row Level Security (RLS) pour isoler les données par utilisateur.

Schéma minimal proposé :

- Table `tasks` : `id`, `user_id`, `titre`, `statut`, `categorie`, `date_creation`, `date_fait`, `updated_at`.
- Index : `(user_id, updated_at desc)`.

Flux applicatif :

1. Connexion utilisateur (email magic link ou OAuth Google).
2. Chargement `tasks` filtrées par `user_id`.
3. CRUD via API Supabase depuis le navigateur.
4. Synchronisation automatique entre PC via la base distante.

Pourquoi Supabase ici :

- Mise en place rapide pour un CRUD classique.
- Postgres robuste (mieux qu'un JSON local pour multi-appareils).
- Gratuit pour démarrer avec quota raisonnable.

Alternative si tu veux très léger/coût bas :

- **Cloudflare Workers + D1 (SQLite serverless)**
  - Très bon coût/perf, mais un peu plus de code API à écrire qu'avec Supabase.

MVP en 1 journée (ordre conseillé) :

- Créer le projet Supabase + table `tasks`.
- Ajouter l'auth (magic link).
- Implémenter `storage.remote.js` (get/create/update/toggle/delete).
- Brancher `taskService` dans `index.html` pour remplacer `google.script.run`.

## Option C — Conserver Google Sheets via Web App Apps Script

**But** : GitHub Pages en front, Google Apps Script conservé comme API HTTP.

- Transformer `Code.gs` en endpoints HTTP (`doGet`/`doPost`) ou routeur JSON.
- Publier l'Apps Script comme Web App.
- Depuis GitHub Pages, appeler l'URL webapp via `fetch()`.

### Avantages
- Réutilise votre logique/données Google Sheets.
- Migration progressive.

### Limites
- CORS et sécurité à traiter proprement.
- Apps Script reste un backend externe (pas 100% GitHub natif).

### Réactivité de l'option C (question fréquente)

**Elle peut rester correcte**, mais sera en général **moins réactive** qu'un stockage local, car chaque action passe par un appel réseau + Apps Script + Google Sheets.

En pratique :

- Sur bonne connexion : ressenti souvent acceptable pour une todo list.
- Sur réseau lent/instable : latence visible (chargement, toggle, suppression).
- Sous charge ou quotas Apps Script : temps de réponse plus irréguliers.

Pour garder une bonne UX avec l'option C :

- Conserver les **optimistic updates** côté front (déjà présent dans ton UI).
- Ajouter un cache local court (ex. dernier état des tâches).
- Réduire le nombre d'appels (batch, debounce si nécessaire).
- Prévoir des états visuels clairs : `syncing`, `synced`, `error`.

Conclusion :

- **Oui, option C peut être un peu moins réactive**.
- **Non, ce n'est pas forcément bloquant** pour un usage personnel/équipe légère si l'UX de synchronisation est bien gérée.

## 5) Recommandation pragmatique

Vu le code existant, la meilleure trajectoire en 2 temps :

1. **Étape 1 (rapide)** : Option A pour publier immédiatement sur GitHub Pages.
2. **Étape 2 (robuste)** : évoluer vers Option C (ou B) si vous avez besoin de synchro multi-appareils.

## 6) Plan de migration concret

### Phase 1 — Découplage de la couche données

Créer une abstraction unique côté front :

- `taskService.getAll()`
- `taskService.create(task)`
- `taskService.update(id, patch)`
- `taskService.toggle(id)`
- `taskService.remove(id)`

Puis remplacer chaque appel `google.script.run` par cette abstraction.

### Phase 2 — Implémentation GitHub Pages (localStorage)

- Nouveau fichier `storage.local.js`.
- Stocker un tableau JSON sous une clé versionnée (ex: `taches.v1`).
- Prévoir migration simple de schéma si besoin.

### Phase 3 — Déploiement

- Conserver `index.html` à la racine (simple pour Pages).
- Activer GitHub Pages (branche principale / dossier root).
- Vérifier l'app en navigation privée et sur mobile.

### Phase 4 — Backend distant (optionnel)

- Ajouter `storage.remote.js` avec `fetch()`.
- Basculer par variable d'environnement build-time (ou config JS).

## 7) Risques techniques identifiés

- IDs basés sur `Date.now()` : collision faible mais possible en usage concurrent.
- Validations côté front seulement : à renforcer si backend distant.
- Format de date texte localisé : préférer ISO en stockage + formatage au rendu.

## 8) Checklist de préparation GitHub Pages

- [ ] Remplacer tous les `google.script.run`.
- [ ] Isoler la persistance dans un service.
- [ ] Tester CRUD complet sans backend Apps Script.
- [ ] Vérifier les dépendances CDN (Bootstrap/Icons) en HTTPS.
- [ ] Ajouter un `README` avec procédure de déploiement Pages.

## 9) Conclusion

L'UI est déjà compatible GitHub Pages, mais la couche données est actuellement **fortement couplée à Apps Script**. La migration est donc surtout un travail de **remplacement de l'API de persistance**.

En résumé : publication statique possible rapidement, à condition de remplacer le backend Apps Script par une stratégie locale (rapide) ou une API HTTP (pérenne).
