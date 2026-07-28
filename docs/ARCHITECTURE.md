# Architecture STEGFlow

## Applications

- `apps/admin` — Angular : supervision, programmation des coupures, dispatch et notifications.
- `apps/citizen` — Angular PWA : état d’une adresse, suivi live et signalements avec photos.
- `apps/maintenance` — Angular mobile-first : mission, GPS, diagnostic, preuves terrain et clôture.
- `apps/api` — NestJS : API, WebSocket, PostGIS, files BullMQ et stockage S3.

## Flux d’une coupure

1. Un agent sélectionne une zone électrique, un départ ou un périmètre PostGIS.
2. L’API calcule les compteurs et contrats reliés à l’équipement concerné.
3. Un superviseur valide l’opération lorsque la règle à deux niveaux est active.
4. Une tâche idempotente est ajoutée dans BullMQ.
5. Les workers distribuent les notifications Push, SMS et e-mail avec reprise exponentielle.
6. Les changements de statut sont transmis aux trois applications par WebSocket.
7. Les accusés de livraison et actions des agents sont conservés dans le journal d’audit.

## Flux d’une mission terrain

`Affectée → Acceptée → En déplacement → Sur place → Diagnostic → Réparation → Tests → Rétablie → Clôturée`

La position précise est réservée à la supervision. Le citoyen reçoit une position approximative,
légèrement différée, uniquement pendant la mission qui concerne sa zone.

## Données géographiques

- `Point` : incident, compteur, véhicule ou dernière position d’une équipe.
- `LineString` : câble et départ électrique.
- `Polygon` : zone alimentée, zone de coupure ou périmètre d’intervention.
- Les coordonnées publiques sont arrondies ou transformées avant diffusion.

## Sécurité

- Authentification OIDC/JWT et MFA pour les comptes internes.
- RBAC : administrateur, superviseur, opérateur, dispatcher, technicien et citoyen.
- Chiffrement des photos, URLs temporaires et suppression des métadonnées non nécessaires.
- Journal d’audit append-only pour les validations, changements de statut et notifications.
- Le suivi GPS est actif uniquement pendant une mission et s’arrête automatiquement à sa clôture.

## Déploiement local

`compose.yaml` lance PostGIS, Redis, MinIO, l’API et les trois interfaces. Les secrets réels restent
hors du dépôt et sont injectés par l’environnement de déploiement.
