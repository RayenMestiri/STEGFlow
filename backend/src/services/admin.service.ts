import type { NotificationChannel } from '../domain/constants.js';
import { HttpError, notFound } from '../lib/http-error.js';
import {
  AuditLog,
  AuthEvent,
  FieldTeam,
  Incident,
  Mission,
  NotificationCampaign,
  Outage,
  SystemSetting,
} from '../models/index.js';
import { emitMissionStatus } from '../realtime/operations.js';
import type { AuthUser } from '../types/auth.js';
import { enqueueNotification } from './notifications.service.js';

export async function getAdminDashboard() {
  const [outages, incidents, missions, teams, campaigns] = await Promise.all([
    Outage.find(),
    Incident.find(),
    Mission.find(),
    FieldTeam.find(),
    NotificationCampaign.find(),
  ]);
  const openIncidentStatuses = new Set([
    'reported',
    'verified',
    'dispatched',
    'in_progress',
  ]);
  const activeOutages = outages.filter((item) => item.status === 'active');
  const recipients = campaigns.reduce(
    (sum, campaign) => sum + campaign.recipients,
    0,
  );
  const delivered = campaigns.reduce(
    (sum, campaign) => sum + campaign.delivered,
    0,
  );
  const failed = campaigns.reduce(
    (sum, campaign) => sum + campaign.failed,
    0,
  );
  const affectedNow = activeOutages.reduce(
    (sum, outage) => sum + outage.affectedCustomers,
    0,
  );
  const networkAvailability = Number(
    Math.max(0, 100 - (affectedNow / 1_000_000) * 100).toFixed(2),
  );

  return {
    generatedAt: new Date().toISOString(),
    networkAvailability,
    monthlyTarget: 98.5,
    outages: {
      total: outages.length,
      active: activeOutages.length,
      scheduled: outages.filter((item) =>
        ['scheduled', 'notified'].includes(String(item.status)),
      ).length,
      pendingApproval: outages.filter(
        (item) => item.status === 'pending_approval',
      ).length,
      affectedCustomers: outages
        .filter(
          (item) => !['closed', 'restored'].includes(String(item.status)),
        )
        .reduce((sum, item) => sum + item.affectedCustomers, 0),
    },
    incidents: {
      total: incidents.length,
      open: incidents.filter((item) =>
        openIncidentStatuses.has(item.status),
      ).length,
      critical: incidents.filter(
        (item) =>
          item.severity === 'critical' &&
          openIncidentStatuses.has(item.status),
      ).length,
    },
    teams: {
      total: teams.length,
      available: teams.filter((item) => item.status === 'available').length,
      onMission: teams.filter((item) => item.status === 'on_mission').length,
      connected: teams.filter((item) => item.status !== 'offline').length,
    },
    missions: {
      active: missions.filter((item) => item.status !== 'closed').length,
    },
    notifications: {
      campaigns: campaigns.length,
      recipients,
      delivered,
      failed,
      deliveryRate: recipients
        ? Number(((delivered / recipients) * 100).toFixed(1))
        : 100,
    },
  };
}

export async function getTeams() {
  const [teams, missions] = await Promise.all([
    FieldTeam.find().sort({ code: 1 }),
    Mission.find().sort({ updatedAt: -1 }),
  ]);
  return teams.map((team) => ({
    ...team.toJSON(),
    currentMission:
      missions.find(
        (mission) =>
          String(mission._id) === team.currentMissionId ||
          (mission.teamCode === team.code && mission.status !== 'closed'),
      ) ?? null,
  }));
}

export async function updateTeam(
  id: string,
  status: string,
  actor: AuthUser,
) {
  const team = await FieldTeam.findById(id);
  if (!team) throw notFound('Équipe introuvable');
  if (team.currentMissionId && status === 'available') {
    const mission = await Mission.findById(team.currentMissionId);
    if (mission && mission.status !== 'closed') {
      throw new HttpError(
        409,
        'Clôturez ou réaffectez la mission active avant de rendre cette équipe disponible.',
      );
    }
  }
  team.status = status as any;
  team.lastSeenAt = new Date();
  await team.save();
  await recordAudit({
    action: 'team.status_changed',
    category: 'Équipes',
    title: `${team.code} — statut mis à jour`,
    details: `Nouveau statut : ${status}`,
    severity: 'info',
    entityType: 'team',
    entityId: String(team._id),
    actor,
    metadata: { status },
  });
  return team;
}

export async function updateOutageStatus(
  id: string,
  status: string,
  actor: AuthUser,
) {
  const outage = await Outage.findById(id);
  if (!outage) throw notFound('Coupure introuvable');
  const previous = outage.status;
  outage.status = status as any;
  await outage.save();
  await recordAudit({
    action: 'outage.status_changed',
    category: 'Coupures',
    title: `${outage.reference} — ${outage.zoneLabel}`,
    details: `${previous} → ${status}`,
    severity: status === 'active' ? 'warning' : 'success',
    entityType: 'outage',
    entityId: String(outage._id),
    actor,
    metadata: { previous, current: status },
  });
  return outage;
}

export async function updateIncident(
  id: string,
  payload: { status?: string; severity?: string },
  actor: AuthUser,
) {
  const incident = await Incident.findById(id);
  if (!incident) throw notFound('Incident introuvable');
  if (payload.status) incident.status = payload.status as any;
  if (payload.severity) incident.severity = payload.severity as any;
  incident.activity.push({
    at: new Date().toISOString(),
    label: payload.status
      ? `Statut modifié : ${payload.status}`
      : `Priorité modifiée : ${payload.severity}`,
    actor: `${actor.firstName} ${actor.lastName}`,
  });
  await incident.save();
  await recordAudit({
    action: 'incident.updated',
    category: 'Signalements',
    title: `${incident.reference} — dossier mis à jour`,
    details: payload.status
      ? `Statut : ${payload.status}`
      : `Priorité : ${payload.severity}`,
    severity: payload.severity === 'critical' ? 'critical' : 'info',
    entityType: 'incident',
    entityId: String(incident._id),
    actor,
    metadata: payload,
  });
  return incident;
}

export async function assignIncident(
  incidentId: string,
  teamId: string,
  actor: AuthUser,
) {
  const [incident, team] = await Promise.all([
    Incident.findById(incidentId),
    FieldTeam.findById(teamId),
  ]);
  if (!incident) throw notFound('Incident introuvable');
  if (!team) throw notFound('Équipe introuvable');
  if (['resolved', 'rejected'].includes(String(incident.status))) {
    throw new HttpError(
      409,
      'Cet incident est déjà clôturé et ne peut plus être affecté.',
    );
  }
  if (team.status === 'offline' || team.currentMissionId) {
    throw new HttpError(
      409,
      'Cette équipe est indisponible ou possède déjà une mission active.',
    );
  }
  const existingMission = await Mission.findOne({
    incidentId: String(incident._id),
    status: { $ne: 'closed' },
  });
  if (existingMission) {
    throw new HttpError(
      409,
      `Une mission active (${existingMission.reference}) existe déjà pour cet incident.`,
    );
  }

  const sequence = (await Mission.countDocuments()) + 1;
  const mission = await Mission.create({
    reference: `INT-${String(2048 + sequence).padStart(4, '0')}`,
    teamCode: team.code,
    incidentId: String(incident._id),
    status: 'assigned',
    lastPosition: team.location,
    lastPositionAt: team.lastSeenAt,
    etaMinutes: 18,
    statusHistory: [
      {
        status: 'assigned',
        at: new Date().toISOString(),
        source: `${actor.firstName} ${actor.lastName}`,
      },
    ],
  });
  incident.assignedTeamCode = team.code;
  incident.status = 'dispatched';
  incident.activity.push({
    at: new Date().toISOString(),
    label: `${team.code} affectée — mission ${mission.reference}`,
    actor: `${actor.firstName} ${actor.lastName}`,
  });
  team.status = 'on_mission';
  team.currentMissionId = String(mission._id);
  await Promise.all([incident.save(), team.save()]);
  emitMissionStatus(String(mission._id), mission.status);
  await recordAudit({
    action: 'incident.team_assigned',
    category: 'Dispatch',
    title: `${team.code} affectée à ${incident.reference}`,
    details: `Mission ${mission.reference} créée avec une arrivée estimée à 18 min.`,
    severity: 'success',
    entityType: 'mission',
    entityId: String(mission._id),
    actor,
    metadata: { incidentId: String(incident._id), teamId: String(team._id) },
  });
  return { incident, team, mission };
}

export function getNotificationCampaigns() {
  return NotificationCampaign.find().sort({ createdAt: -1 });
}

export async function sendNotification(
  payload: {
    title: string;
    body: string;
    audienceLabel: string;
    zoneId?: string;
    channels: NotificationChannel[];
    recipients: number;
  },
  actor: AuthUser,
) {
  const result = await enqueueNotification({
    eventId: `manual-${Date.now()}`,
    audience: { zoneId: payload.zoneId },
    audienceLabel: payload.audienceLabel,
    channels: payload.channels,
    title: payload.title,
    body: payload.body,
    recipients: payload.recipients,
    createdBy: `${actor.firstName} ${actor.lastName}`,
  });
  await recordAudit({
    action: 'notification.sent',
    category: 'Notifications',
    title: payload.title,
    details: `${payload.recipients} destinataires · ${payload.channels.join(', ')}`,
    severity: 'success',
    entityType: 'notification',
    entityId: String(result.campaign._id),
    actor,
    metadata: {
      channels: payload.channels,
      recipients: payload.recipients,
    },
  });
  return result.campaign;
}

export async function retryNotification(id: string, actor: AuthUser) {
  const campaign = await NotificationCampaign.findById(id);
  if (!campaign) throw notFound('Campagne introuvable');
  const result = await enqueueNotification({
    eventId: `retry-${campaign.id}-${Date.now()}`,
    audience: { zoneId: campaign.zoneId ?? undefined },
    audienceLabel: `Relance · ${campaign.audienceLabel}`,
    channels: campaign.channels as NotificationChannel[],
    title: campaign.title,
    body: campaign.body,
    recipients: Math.max(campaign.failed, 1),
    createdBy: `${actor.firstName} ${actor.lastName}`,
  });
  await recordAudit({
    action: 'notification.retried',
    category: 'Notifications',
    title: `Relance ${campaign.reference}`,
    details: `${Math.max(campaign.failed, 1)} destinataires remis en file.`,
    severity: 'info',
    entityType: 'notification',
    entityId: String(result.campaign._id),
    actor,
    metadata: { sourceCampaignId: String(campaign._id) },
  });
  return result.campaign;
}

export async function getAuditLog() {
  const [operations, authEvents] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).limit(150),
    AuthEvent.find().sort({ createdAt: -1 }).limit(80),
  ]);
  const titles: Record<string, string> = {
    login_success: 'Connexion réussie',
    login_failed: 'Tentative de connexion refusée',
    account_locked: 'Compte temporairement verrouillé',
    register: 'Compte citoyen créé',
    refresh_reuse: 'Réutilisation de session détectée',
    logout: 'Déconnexion sécurisée',
  };
  const authRows = authEvents.map((event) => ({
    id: String(event._id),
    action: event.type,
    category: 'Authentification',
    title: titles[event.type] ?? event.type,
    details: event.reason ?? event.ipAddress ?? 'Accès sécurisé',
    severity: ['login_failed', 'account_locked'].includes(event.type)
      ? 'warning'
      : 'info',
    entityType: 'user',
    entityId: event.userId,
    actorEmail: event.email,
    actorName: event.email,
    metadata: { ipAddress: event.ipAddress },
    createdAt: event.createdAt,
  }));
  return [
    ...operations.map((entry) => entry.toJSON()),
    ...authRows,
  ]
    .sort(
      (left: any, right: any) =>
        +new Date(right.createdAt) - +new Date(left.createdAt),
    )
    .slice(0, 180);
}

export function getSystemSettings() {
  return SystemSetting.find().sort({ group: 1, label: 1 });
}

export async function updateSystemSettings(
  settings: Array<{
    key: string;
    booleanValue?: boolean;
    stringValue?: string;
    numberValue?: number;
    objectValue?: Record<string, unknown>;
  }>,
  actor: AuthUser,
) {
  const saved = [];
  for (const update of settings) {
    const setting = await SystemSetting.findOne({ key: update.key });
    if (!setting) continue;
    setting.value =
      update.booleanValue ??
      update.numberValue ??
      update.stringValue ??
      update.objectValue ??
      null;
    setting.updatedBy = actor.email;
    saved.push(await setting.save());
  }
  await recordAudit({
    action: 'settings.updated',
    category: 'Administration',
    title: 'Paramètres opérationnels mis à jour',
    details: `${saved.length} réglage(s) enregistré(s).`,
    severity: 'info',
    entityType: 'settings',
    entityId: null,
    actor,
    metadata: { keys: saved.map((setting) => setting.key) },
  });
  return saved;
}

export async function recordAudit(entry: {
  action: string;
  category: string;
  title: string;
  details: string | null;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  actor: AuthUser;
  metadata: Record<string, unknown>;
}) {
  return AuditLog.create({
    action: entry.action,
    category: entry.category,
    title: entry.title,
    details: entry.details,
    severity: entry.severity as any,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorEmail: entry.actor.email,
    actorName: `${entry.actor.firstName} ${entry.actor.lastName}`,
    metadata: entry.metadata,
  });
}
