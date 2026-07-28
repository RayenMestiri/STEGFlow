# STEGFlow

Plateforme opérationnelle pour programmer les coupures, coordonner les équipes de maintenance,
informer les citoyens et suivre les interventions en temps réel.

## Structure

| Application | Commande locale | Adresse |
| --- | --- | --- |
| Centre STEG | `npm run start:admin` | http://localhost:4200 |
| Portail citoyen PWA | `npm run start:citizen` | http://localhost:4201 |
| Équipe de maintenance | `npm run start:maintenance` | http://localhost:4202 |
| API NestJS | `npm run start:api` | http://localhost:3000/api/v1 |
| Documentation API | — | http://localhost:3000/api/docs |

## Installation

```bash
npm install
npm --prefix apps/api install
```

Copier `.env.example` vers `.env` et remplacer les valeurs de développement avant un déploiement.

## Comptes de démonstration

| Espace | Identifiant | Mot de passe |
| --- | --- | --- |
| Supervision STEG | `superviseur@steg.tn` | `Admin2026!` |
| Équipe terrain | `technicien@steg.tn` | `Tech2026!` |
| Citoyen | `citoyen@steg.tn` | `Client2026!` |

Le bouton « compte de démonstration » remplit automatiquement ces informations en environnement local. Les sessions utilisent un jeton d’accès court et un jeton de renouvellement conservé dans un cookie HTTP-only.

## Infrastructure complète

```bash
docker compose up --build
```

Cette commande lance :

- PostgreSQL avec PostGIS ;
- Redis et BullMQ ;
- MinIO pour les photos ;
- l’API NestJS ;
- les trois interfaces Angular.

Après le démarrage, les portails sont directement disponibles sur les ports 4200, 4201 et 4202. Les données de démonstration initiales incluent des coupures, un incident critique, une mission `INT-2048` et les trois comptes ci-dessus.

## Parcours fonctionnels

- Centre STEG : authentification par rôle, carte opérationnelle OpenStreetMap, positions exactes des équipes, programmation et publication d’une coupure, déclenchement asynchrone des notifications.
- Citoyen : connexion ou création de compte en quatre étapes, carte de suivi avec position volontairement approximative, signalement GPS, photos et état de zone.
- Maintenance : mission active, itinéraire cartographique, navigation externe, cycle complet des statuts, diagnostic, preuves photo, SOS et transmission GPS limitée à la mission.
- API : PostgreSQL/PostGIS, Redis/BullMQ, stockage S3 compatible, WebSocket de mission, Swagger et contrôle d’accès JWT.

Les cartes sont rendues avec MapLibre et les tuiles OpenStreetMap. Le superviseur et l’équipe affectée reçoivent les coordonnées opérationnelles exactes ; le portail citoyen reçoit uniquement une position arrondie et limitée à sa mission. Une connexion internet est nécessaire pour charger les tuiles cartographiques publiques.

## Validation

```bash
npm run build:all
npm test
npm run test:api
docker compose config
```

Les choix et flux techniques sont détaillés dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
