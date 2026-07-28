# 📚 Guide Fonctionnel et Technique : Fonctionnement de STEGFlow (Backend & Frontend)

Ce document explique en détail le fonctionnement complet de la plateforme **STEGFlow**, de son architecture **Backend** (API NestJS, PostgreSQL/PostGIS, Redis, Cloudinary) à ses **3 applications Frontend** (Admin, Citoyen, Maintenance) et sa bibliothèque partagée (`shared-data-access`).

---

## 🎯 1. Vue d'Ensemble de l'Écosystème STEGFlow

**STEGFlow** est une solution numérique d'entreprise conçue pour la **Société Tunisienne de l'Électricité et du Gaz (STEG)** afin d'optimiser la gestion des coupures de courant, la remontée d'incidents citoyens et le pilotage des équipes de maintenance sur le terrain.

```
                               ┌───────────────────────────────────────────────┐
                               │             Bibliothèque Partagée             │
                               │           libs/shared-data-access             │
                               │  (Auth, API Client, MapLibre, Design Tokens)  │
                               └───────────────────────┬───────────────────────┘
                                                       │
                 ┌─────────────────────────────────────┼─────────────────────────────────────┐
                 │                                     │                                     │
                 ▼                                     ▼                                     ▼
     ┌──────────────────────┐              ┌──────────────────────┐              ┌──────────────────────┐
     │   Admin Operations   │              │     Citizen PWA      │              │ STEGField Maintenance│
     │     apps/admin       │              │     apps/citizen     │              │   apps/maintenance   │
     │  (Port 4200 / 8080)  │              │  (Port 4201 / 8081)  │              │  (Port 4202 / 8082)  │
     └───────────┬──────────┘              └───────────┬──────────┘              └───────────┬──────────┘
                 │                                     │                                     │
                 └─────────────────────────────────────┼─────────────────────────────────────┘
                                                       │  Requêtes REST / WebSockets
                                                       ▼
                               ┌───────────────────────────────────────────────┐
                               │               Backend API Core                │
                               │                   apps/api                    │
                               │            (NestJS / Port 3000)               │
                               └───────────────────────┬───────────────────────┘
                                                       │
         ┌──────────────────────────────┬──────────────┴──────────────┬──────────────────────────────┐
         ▼                              ▼                             ▼                              ▼
┌─────────────────┐            ┌─────────────────┐           ┌─────────────────┐            ┌─────────────────┐
│ PostgreSQL/GIS  │            │  Redis / BullMQ │           │ Cloudinary CDN  │            │ MinIO / S3 Storage│
│  (Port 5432)    │            │   (Port 6379)   │           │ (Media Upload)  │            │   (Port 9000)   │
└─────────────────┘            └─────────────────┘           └─────────────────┘            └─────────────────┘
```

---

## 💻 2. Architecture Frontend (Applications Angular)

Les applications front-end sont construites avec **Angular 19** et partagent une bibliothèque commune `shared-data-access` pour éviter toute duplication de code.

### 🏢 A. Centre de Supervision & Opérations Admin (`apps/admin`)
- **Rôle** : Interface centrale des superviseurs, ingénieurs réseau et dispatchers STEG.
- **Fonctionnalités clés** :
  - **Carte Opérationnelle Temps Réel** : Visualisation MapLibre GL interactive affichant tous les incidents critiques, les coupures enregistrées et les positions exactes des équipes terrain (`addStegMarker`, `centerOperationsMap`).
  - **Gestion des Coupures Programmiques** : Création assistée en 5 étapes pour planifier des coupures de maintenance (choix de la zone, du départ MT, horaire, durée et approbation superviseur).
  - **Centre de Dispatching** : Affectation instantanée des signalements reçus aux équipes disponibles en fonction de leur géolocalisation.
  - **Campagnes de Notification** : Envoi de messages ciblés (Push, SMS, Email) aux citoyens d'un secteur touché.
  - **Paramètres du Système & Audit** : Modification dynamique des variables opérationnelles et journalisation de toutes les actions administratives avec export CSV.

### 📱 B. Portail Citoyen PWA (`apps/citizen`)
- **Rôle** : Application web progressive (PWA) destinée aux abonnés STEG.
- **Fonctionnalités clés** :
  - **Signalement d'Incident** : Déclaration rapide d'une anomalie (câble à terre, transformateur bruyant, panne de quartier) avec prise de photo directe ou upload Cloudinary, et sélection de position sur carte.
  - **Suivi en Direct de la Situation** : Consultation de l'état du réseau dans la zone de l'abonné (Normale, Coupure Confirmée, Intervention en Cours, Rétablissement).
  - **Confirmation Communautaire** : Bouton permettant aux voisins de confirmer une panne ou d'indiquer le retour du courant ("+1 confirmation").
  - **Position Floutée de l'Équipe** : Pour la sécurité des agents, la position de l'équipe d'intervention est affichée de manière approximative (rayon de 300m) avec estimation du temps d'arrivée (ETA).
  - **Guides de Sécurité & Numéros d'Urgence** : Consignes de sécurité électrique et contact direct avec les services d'urgence.

### 🛠️ C. Application Terrain STEGField (`apps/maintenance`)
- **Rôle** : Interface mobile-first optimisée pour les techniciens et équipes d'intervention sur le terrain.
- **Fonctionnalités clés** :
  - **Parcours de Mission en 9 Étapes** : Suivi rigoureux du cycle d'intervention (*Assignée ➔ Acceptée ➔ En Déplacement ➔ Arrivée ➔ Diagnostic ➔ Réparation ➔ Tests ➔ Rétablie ➔ Clôturée*).
  - **Navigation & Carte d'Itinéraire** : Affichage dynamique du tracé entre la position du véhicule STEG et le lieu de l'incident (`drawStegRoute`).
  - **Prise de Preuve Photo (Cloudinary)** : Zone de dépôt de photos avant/après réparation envoyées directement vers le CDN Cloudinary.
  - **Bouton d'Urgence SOS** : Sirène d'alerte immédiate en cas de danger électrique, blessure ou menace de sécurité, transmettant la position GPS exacte au centre des opérations.
  - **Support Hors Connexion** : Stockage local des données de rapport pour soumission automatique dès le retour du réseau.

### 📦 D. Bibliothèque Partagée (`libs/shared-data-access`)
- **`StegApiService`** : Client HTTP centralisant l'accès aux endpoints REST (`/auth`, `/incidents`, `/outages`, `/missions`, `/teams`, `/media`).
- **`AuthService`** : Gestion des tokens JWT, rôles (RBAC) et persistance des sessions utilisateur.
- **Moteur Cartographique (`steg-map.ts`)** : Helper MapLibre GL prêt à l'emploi gérant l'initialisation (`createStegMap`), la pose de marqueurs stylisés (`addStegMarker`), le tracé d'itinéraires (`drawStegRoute`) et le centrage dynamique (`fitStegMap`).
- **Système de Design (`steg-tokens.scss`, `steg-premium.scss`)** : Palette de couleurs, typographie (Inter/Manrope), cartes glassmorphes, thèmes sombres/clairs et animations.

---

## ⚙️ 3. Architecture Backend (API NestJS & Infrastructure)

Le backend est développé avec **NestJS** (Node.js/TypeScript), s'appuyant sur une architecture modulaire robuste et évolutive.

### 🗄️ A. Base de Données Spatiale (PostgreSQL + PostGIS)
L'API utilise **TypeORM** couplé à **PostGIS** pour gérer la géométrie spatiale du réseau électrique tunisien :
- **`IncidentEntity`** : Stocke la position géospatiale (`Geometry(Point, 4326)`), l'adresse, la gravité (`critical`, `high`, `medium`, `low`), les photos Cloudinary et les confirmations.
- **`OutageEntity`** : Représente les zones de coupures électriques impactant des milliers d'abonnés.
- **`MissionEntity` & `FieldTeamEntity`** : Suivent l'affectation, les historiques de positions GPS de l'équipe et les détails du rapport d'intervention.
- **Calculs Spatiaux** : Utilisation des fonctions PostGIS (`ST_SetSRID`, `ST_MakePoint`, `ST_Distance`) pour déterminer les équipes les plus proches d'un incident.

### 📸 B. Service Multimédia Hybride (Cloudinary & MinIO S3)
Le composant `MediaModule` (`apps/api/src/media/media.service.ts`) assure la prise en charge sécurisée des photos :
1. **Cloudinary (Mode Principal)** : Envoi direct via stream (`cloudinary.uploader.upload_stream`) vers le compte Cloudinary configuré (`roarxt0j`). Retourne des URLs HTTPS optimisées par le CDN mondial.
2. **MinIO / Local Storage (Mode Fallback)** : Si la connexion externe est indisponible, les images sont sauvegardées sur le stockage objet S3 local MinIO.

### 🔐 C. Authentification & Sécurité (JWT + RBAC)
- **JWT (JSON Web Tokens)** : Authentification sans état basée sur des jetons signés transmis dans l'en-tête `Authorization: Bearer <token>`.
- **Hachage Sécurisé** : Mots de passe hachés avec `bcrypt` (10 rounds).
- **Guards de Rôles (`RolesGuard`)** : Protection granulaire des routes API selon le rôle de l'utilisateur (`admin`, `supervisor`, `dispatcher`, `technician`, `citizen`).

### ⚡ D. Traitement Asynchrone & WebSockets (BullMQ + Redis)
- **Files d'Attente Redis (BullMQ)** : Déchargement des tâches lourdes (envoi de campagnes de notifications SMS/Push, notifications de masse lors des coupures).
- **WebSockets (`EventsGateway`)** : Diffusion en temps réel des changements d'état (nouvel incident signalé, déplacement de véhicule terrain) vers le tableau de bord Admin et l'application STEGField.

---

## 🔄 4. Scénario d'Utilisation : Flux Complet de Bout en Bout

Voici le déroulement pas-à-pas d'un événement sur la plateforme STEGFlow :

```
[1. Citoyen] Signalement de la panne sur PWA ➔ Photo envoyée sur Cloudinary ➔ Incident enregistré dans PostgreSQL/PostGIS.
                                │
                                ▼
[2. Centre Admin] Alerte temps réel via WebSocket ➔ Affichage du marqueur rouge sur la Carte Opérationnelle MapLibre.
                                │
                                ▼
[3. Dispatching] Le superviseur affecte l'Incident à l'« Équipe 12 » ➔ Création automatique d'une Mission.
                                │
                                ▼
[4. Technicien STEGField] Notification reçue sur mobile ➔ Démarrage de la mission ➔ Suivi du tracé d'itinéraire bleu.
                                │
                                ▼
[5. Intervention] Progression des 9 étapes (Diagnostic ➔ Réparation) ➔ Upload de la photo de preuve de réparation sur Cloudinary.
                                │
                                ▼
[6. Clôture & Notification] Statut « Rétabli » validé ➔ Envoi automatique par Redis/BullMQ d'une notification aux citoyens impactés.
```

---

## 🚀 5. Commandes de Lancement Rapide

### Démarrage des Services d'Infrastructure (Docker)
```bash
docker compose up postgres redis minio -d
```

### Lancement de l'Ensemble des Applications (Mode Développement)
```bash
npm run start:all
```

| Composant | URL Locale | Description |
| :--- | :--- | :--- |
| **API NestJS Core** | `http://localhost:3000` | Backend REST / WebSockets / Swagger |
| **Admin Operations** | `http://localhost:4200` | Supervision réseau & dispatching |
| **Citizen PWA** | `http://localhost:4201` | Portail citoyen & signalements |
| **STEGField Mobile** | `http://localhost:4202` | App techniciens de maintenance |

---

## 📝 6. Structure des Fichiers Clés du Projet

```
Steg application/
├── apps/
│   ├── admin/                    # Application Angular Supervision Admin (Port 4200)
│   │   └── src/app/app.ts        # Carte opérationnelle, dispatching, coupures, audit
│   ├── citizen/                  # Application Angular Portail Citoyen PWA (Port 4201)
│   │   └── src/app/app.ts        # Signalement d'incidents, statut réseau, guides
│   ├── maintenance/              # Application Angular STEGField Techniciens (Port 4202)
│   │   └── src/app/app.ts        # 9 étapes de mission, preuves photo, itinéraire, SOS
│   └── api/                      # Backend NestJS Core API (Port 3000)
│       └── src/
│           ├── admin/            # Services d'administration & statistiques
│           ├── citizen/          # Endpoints publics & confirmations citoyens
│           ├── incidents/        # Entités & contrôleurs d'incidents PostGIS
│           ├── media/            # Integration Cloudinary SDK & MinIO S3
│           ├── missions/         # Suivi des missions & positions GPS des équipes
│           └── notifications/    # File d'attente BullMQ / Redis pour SMS & Push
├── libs/
│   └── shared-data-access/       # Library Angular partagée
│       └── src/lib/
│           ├── api.service.ts    # Service HTTP partagé
│           ├── auth.service.ts   # Service d'authentification JWT & Rôles
│           ├── steg-map.ts       # Service cartographique MapLibre GL
│           └── theme/            # Tokens CSS & thèmes visuels
├── docs/                         # Documentation technique
│   ├── ARCHITECTURE.md           # Schémas d'architecture Mermaid & modèle PostGIS
│   └── HOW_IT_WORKS.md           # Présente notice détaillée de fonctionnement
├── docker-compose.yml            # Services Docker (PostgreSQL 16, Redis 7, MinIO)
└── package.json                  # Scripts monorepo & dépendances npm
```
