import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import {
  AuditLog,
  FieldTeam,
  Incident,
  Mission,
  NotificationCampaign,
  Outage,
  SystemSetting,
  User,
} from '../models/index.js';

export async function seedDatabase() {
  if (!env.SEED_DEMO_DATA) return;
  await seedUsers();
  await seedOutages();
  const incident = await seedIncident();
  const mission = await seedMission(String(incident._id));
  await seedTeams(String(mission._id), mission.lastPosition ?? null);
  await Promise.all([seedCampaigns(), seedSettings(), seedAudit()]);
}

async function seedUsers() {
  const users = [
    {
      email: 'superviseur@steg.tn',
      password: 'Admin2026!',
      firstName: 'Amine',
      lastName: 'Khelifi',
      role: 'supervisor',
      teamCode: null,
      contractNumber: null,
      address: null,
      phone: null,
      governorate: 'Tunis',
      delegation: 'Cité El Khadra',
      district: null,
      latitude: null,
      longitude: null,
    },
    {
      email: 'technicien@steg.tn',
      password: 'Tech2026!',
      firstName: 'Mehdi',
      lastName: 'K.',
      role: 'technician',
      teamCode: 'Équipe 12',
      contractNumber: null,
      address: null,
      phone: null,
      governorate: 'Tunis',
      delegation: 'El Menzah',
      district: null,
      latitude: null,
      longitude: null,
    },
    {
      email: 'citoyen@steg.tn',
      password: 'Client2026!',
      firstName: 'Mohamed',
      lastName: 'Ben Salem',
      role: 'citizen',
      teamCode: null,
      contractNumber: 'STEG-8042',
      address: '14, Rue des Orangers',
      phone: '+21620123456',
      governorate: 'Tunis',
      delegation: 'El Menzah',
      district: 'El Menzah 6',
      latitude: 36.8427,
      longitude: 10.1764,
    },
  ];
  for (const demo of users) {
    const { password, ...profile } = demo;
    await User.updateOne(
      { email: profile.email },
      {
        $setOnInsert: {
          ...profile,
          passwordHash: await bcrypt.hash(password, 12),
          termsAcceptedAt: new Date(),
          active: true,
        },
      },
      { upsert: true },
    );
  }
}

async function seedOutages() {
  if (await Outage.exists({ reference: 'OUT-2026-00001' })) return;
  await Outage.insertMany([
    {
      reference: 'OUT-2026-00001',
      zoneId: 'zone-el-menzah-6-a3',
      zoneLabel: 'El Menzah 6',
      reason: 'Maintenance préventive',
      status: 'scheduled',
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      durationMinutes: 90,
      affectedCustomers: 1842,
      longitude: 10.1764,
      latitude: 36.8427,
      supervisorApprovalRequired: true,
    },
    {
      reference: 'OUT-2026-00002',
      zoneId: 'zone-le-bardo-b1',
      zoneLabel: 'Le Bardo',
      reason: 'Rééquilibrage réseau',
      status: 'pending_approval',
      startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      durationMinutes: 45,
      affectedCustomers: 2310,
      longitude: 10.1346,
      latitude: 36.8094,
      supervisorApprovalRequired: true,
    },
  ]);
}

async function seedIncident() {
  return (
    (await Incident.findOne({ reference: 'INC-02048' })) ??
    (await Incident.create({
      reference: 'INC-02048',
      type: 'fire',
      description: 'Étincelles visibles près du coffret électrique.',
      address: 'Rue Ibn Khaldoun, La Marsa',
      location: { type: 'Point', coordinates: [10.3303, 36.8782] },
      severity: 'critical',
      status: 'dispatched',
      photos: [],
      communityConfirmations: 7,
      contractNumber: null,
      reportedByUserId: null,
      assignedTeamCode: 'Équipe 12',
      activity: [
        {
          at: new Date().toISOString(),
          label: 'Signalement reçu et classé critique',
          actor: 'Centre des opérations',
        },
      ],
    }))
  );
}

async function seedMission(incidentId: string) {
  return (
    (await Mission.findOne({ reference: 'INT-2050' })) ??
    (await Mission.create({
      reference: 'INT-2050',
      teamCode: 'Équipe 12',
      incidentId,
      status: 'accepted',
      lastPosition: { type: 'Point', coordinates: [10.1764, 36.8427] },
      lastPositionAt: new Date(),
      etaMinutes: 37,
      statusHistory: [
        {
          status: 'assigned',
          at: new Date(Date.now() - 12 * 60_000).toISOString(),
          source: 'Centre des opérations',
        },
        {
          status: 'accepted',
          at: new Date(Date.now() - 10 * 60_000).toISOString(),
          source: 'Équipe 12',
        },
      ],
      acceptedAt: new Date(Date.now() - 10 * 60_000),
    }))
  );
}

async function seedTeams(
  missionId: string,
  missionPosition: { type: string; coordinates: number[] } | null,
) {
  if ((await FieldTeam.countDocuments()) > 0) return;
  await FieldTeam.insertMany([
    {
      code: 'Équipe 12',
      name: 'Intervention Nord',
      leadName: 'Mehdi K.',
      phone: '+216 71 000 812',
      vehicle: 'STEG-2412',
      status: 'on_mission',
      members: 3,
      base: 'Centre Tunis Nord',
      skills: ['HTA/BT', 'Câbles souterrains', 'Urgence'],
      currentMissionId: missionId,
      location: missionPosition,
      lastSeenAt: new Date(),
    },
    {
      code: 'Équipe 04',
      name: 'Maintenance Ariana',
      leadName: 'Nour Gharbi',
      phone: '+216 71 000 804',
      vehicle: 'STEG-2304',
      status: 'available',
      members: 2,
      base: 'Ariana',
      skills: ['Transformateurs', 'Basse tension'],
      location: { type: 'Point', coordinates: [10.1882, 36.8665] },
      lastSeenAt: new Date(Date.now() - 2 * 60_000),
    },
    {
      code: 'Équipe 08',
      name: 'Urgence Grand Tunis',
      leadName: 'Yassine Trabelsi',
      phone: '+216 71 000 808',
      vehicle: 'STEG-2308',
      status: 'available',
      members: 3,
      base: 'Ben Arous',
      skills: ['Incendie électrique', 'Lignes aériennes'],
      location: { type: 'Point', coordinates: [10.2211, 36.7532] },
      lastSeenAt: new Date(Date.now() - 4 * 60_000),
    },
    {
      code: 'Équipe 16',
      name: 'Renfort La Marsa',
      leadName: 'Alya Mansour',
      phone: '+216 71 000 816',
      vehicle: 'STEG-2316',
      status: 'returning',
      members: 2,
      base: 'La Marsa',
      skills: ['Comptage', 'Branchements'],
      location: { type: 'Point', coordinates: [10.3057, 36.8589] },
      lastSeenAt: new Date(Date.now() - 6 * 60_000),
    },
  ]);
}

async function seedCampaigns() {
  if ((await NotificationCampaign.countDocuments()) > 0) return;
  await NotificationCampaign.insertMany([
    {
      reference: 'NTF-2026-00842',
      eventId: 'demo:outage:menzah',
      title: 'Coupure programmée — El Menzah 6',
      body: 'Une interruption est prévue pour maintenance préventive.',
      audienceLabel: 'Zone A3 · El Menzah 6',
      zoneId: 'zone-el-menzah-6-a3',
      channels: ['push', 'sms'],
      status: 'delivered',
      recipients: 1842,
      delivered: 1818,
      failed: 24,
      createdBy: 'Amine Khelifi',
      sentAt: new Date(Date.now() - 45 * 60_000),
    },
    {
      reference: 'NTF-2026-00841',
      eventId: 'demo:incident:critical',
      title: 'Alerte sécurité — La Marsa',
      body: 'Évitez le secteur Rue Ibn Khaldoun. Une équipe est mobilisée.',
      audienceLabel: 'Périmètre de sécurité · La Marsa',
      zoneId: 'zone-la-marsa-hta',
      channels: ['push', 'sms', 'email'],
      status: 'partial',
      recipients: 624,
      delivered: 609,
      failed: 15,
      createdBy: 'Centre des opérations',
      sentAt: new Date(Date.now() - 18 * 60_000),
    },
  ]);
}

async function seedSettings() {
  if ((await SystemSetting.countDocuments()) > 0) return;
  await SystemSetting.insertMany([
    {
      key: 'operations.refresh_seconds',
      group: 'Temps réel',
      label: 'Actualisation des positions',
      description: 'Intervalle de rafraîchissement des équipes actives.',
      value: 15,
    },
    {
      key: 'operations.citizen_location_delay',
      group: 'Confidentialité',
      label: 'Délai de position citoyenne',
      description: 'Décalage appliqué à la position visible côté citoyen.',
      value: 60,
    },
    {
      key: 'notifications.sms_fallback',
      group: 'Notifications',
      label: 'Basculement SMS automatique',
      description:
        'Envoyer un SMS lorsqu’une notification push échoue.',
      value: true,
    },
    {
      key: 'notifications.default_language',
      group: 'Notifications',
      label: 'Langue principale',
      description: 'Langue utilisée pour le premier message envoyé.',
      value: 'fr',
    },
    {
      key: 'security.supervisor_approval',
      group: 'Sécurité',
      label: 'Validation superviseur',
      description:
        'Exiger une validation avant toute publication planifiée.',
      value: true,
    },
    {
      key: 'security.audit_retention_days',
      group: 'Sécurité',
      label: 'Conservation du journal',
      description: 'Durée de conservation des événements opérationnels.',
      value: 365,
    },
  ]);
}

async function seedAudit() {
  if (await AuditLog.exists({ action: 'platform.started' })) return;
  await AuditLog.create({
    action: 'platform.started',
    category: 'Système',
    title: 'Centre des opérations initialisé',
    details:
      'Express, MongoDB, Redis, Cloudinary et suivi temps réel disponibles.',
    severity: 'success',
    entityType: 'system',
    entityId: null,
    actorEmail: 'system@steg.tn',
    actorName: 'Système STEGFlow',
    metadata: { version: '2.0.0', stack: 'MEAN' },
  });
}
