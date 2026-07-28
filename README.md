# STEGFlow

Plateforme opérationnelle pour les citoyens, le centre de pilotage STEG et les
équipes de maintenance.

## Stack

- **Frontend** : Angular 21, PWA citoyenne, MapLibre et OpenStreetMap.
- **Backend** : Node.js, Express 5 et TypeScript dans [`backend/`](backend/).
- **Données** : MongoDB Atlas avec documents GeoJSON et index `2dsphere`.
- **Temps réel** : Socket.IO pour les positions GPS et les étapes de mission.
- **Asynchrone** : Redis + BullMQ pour les campagnes de notification.
- **Photos** : Cloudinary, validation MIME et limite de 8 Mo.
- **Sécurité** : JWT court, refresh token HttpOnly, rotation, RBAC, rate limiting,
  verrouillage après échecs et journal d’audit.

## Applications

| Espace | URL | Responsabilité |
| --- | --- | --- |
| Centre des opérations | <http://localhost:4200> | Coupures, incidents, équipes, notifications, audit et paramètres |
| Citoyen | <http://localhost:4201> | Situation personnelle, carte publique, signalements et sécurité |
| Équipe terrain | <http://localhost:4202> | Mission, GPS, diagnostic, photos, urgence et rapport |
| API Express | <http://localhost:3000/api/v1> | API REST MEAN |
| Documentation API | <http://localhost:3000/api/docs> | OpenAPI |

## Structure

```text
backend/                   API Express/Mongoose indépendante
  src/
    config/                Validation de l’environnement
    db/                    Connexion, données initiales et migration
    middleware/            Auth, rôles, validation et erreurs
    models/                Collections Mongoose
    routes/                Routes REST par domaine
    services/              Métier citoyen, mission, admin, média
    realtime/              Socket.IO
apps/
  admin/                   Angular — centre des opérations
  citizen/                 Angular PWA — citoyen
  maintenance/             Angular — équipe terrain
libs/shared-data-access/   Contrats API et composants partagés
```

Le backend est volontairement séparé des applications frontend. L’ancien
backend NestJS sous `apps/api` n’est plus référencé par les scripts ni par Docker.

## Configuration

```powershell
Copy-Item .env.example backend/.env
```

Renseigner dans `backend/.env` :

- `MONGODB_URI`
- `CLOUDINARY_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `REDIS_URL`

Le fichier réel est ignoré par Git. Aucune clé Cloudinary ou MongoDB ne doit être
placée dans Angular, dans Docker Compose ou dans la documentation.

## Démarrage

### Docker

```powershell
docker compose up -d --build --remove-orphans
```

MongoDB est fourni par Atlas ; Docker démarre Redis, Express et les trois
interfaces Angular.

### Développement

```powershell
npm install
npm --prefix backend install
npm run start:api
npm run start:admin
npm run start:citizen
npm run start:maintenance
```

## Migration PostgreSQL vers MongoDB

La migration conserve les identifiants, relations, historiques, positions
GeoJSON, comptes et journaux :

```powershell
npm run migrate:postgres -- --replace
```

`--replace` ne doit être utilisé que pour une première bascule contrôlée. Sans
ce paramètre, le script effectue des `upsert`.

Les anciens mots de passe Argon2 restent valides : à la première connexion,
ils sont automatiquement re-hachés avec le mécanisme du nouveau backend.

## Vérification

```powershell
npm run test
npm run test:api
npm run build:all
```

Comptes locaux de démonstration :

- `superviseur@steg.tn` / `Admin2026!`
- `technicien@steg.tn` / `Tech2026!`
- `citoyen@steg.tn` / `Client2026!`

Un compte citoyen neuf ne reçoit aucune mission, chronologie ou donnée de zone
tant qu’il n’a pas de signalement ou de coupure réellement liée à son profil.
