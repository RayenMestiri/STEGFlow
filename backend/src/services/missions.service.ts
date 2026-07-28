import { HttpError, notFound } from '../lib/http-error.js';
import { FieldTeam, Incident, Mission, User } from '../models/index.js';
import {
  emitMissionEmergency,
  emitMissionReport,
  emitMissionStatus,
  emitTeamPosition,
} from '../realtime/operations.js';
import type { AuthUser } from '../types/auth.js';

export async function findMission(id: string) {
  const mission = await Mission.findById(id);
  if (!mission) throw notFound('Mission introuvable');
  return mission;
}

export async function findCurrentMission(teamCode: string) {
  const mission = await Mission.findOne({
    teamCode,
    status: { $ne: 'closed' },
  }).sort({ updatedAt: -1 });
  if (!mission) {
    throw notFound('Aucune mission active pour cette équipe.');
  }
  return mission;
}

export async function findMissionHistory(teamCode: string) {
  const missions = await Mission.find({ teamCode, status: 'closed' })
    .sort({ updatedAt: -1 })
    .limit(20);
  const incidents = await Incident.find({
    _id: { $in: missions.map((mission) => mission.incidentId) },
  });
  const byId = new Map(
    incidents.map((incident) => [String(incident._id), incident]),
  );
  return missions.map((mission) =>
    historyItem(mission, byId.get(mission.incidentId) ?? null),
  );
}

export async function findMaintenanceDashboard(user: AuthUser) {
  const teamCode = user.teamCode ?? 'Équipe 12';
  const [team, activeMission, closedMissions] = await Promise.all([
    FieldTeam.findOne({ code: teamCode }),
    Mission.findOne({ teamCode, status: { $ne: 'closed' } }).sort({
      updatedAt: -1,
    }),
    Mission.find({ teamCode, status: 'closed' })
      .sort({ updatedAt: -1 })
      .limit(20),
  ]);
  const incidentIds = [
    ...new Set(
      [activeMission, ...closedMissions]
        .filter(Boolean)
        .map((mission) => mission!.incidentId),
    ),
  ];
  const incidents = await Incident.find({ _id: { $in: incidentIds } });
  const byId = new Map(
    incidents.map((incident) => [String(incident._id), incident]),
  );
  const activeIncident = activeMission
    ? (byId.get(activeMission.incidentId) ?? null)
    : null;
  const contact = activeIncident?.contractNumber
    ? await User.findOne({ contractNumber: activeIncident.contractNumber })
    : null;
  const validActiveMission =
    activeMission && activeIncident ? activeMission : null;

  return {
    generatedAt: new Date().toISOString(),
    team: team
      ? {
          id: String(team._id),
          code: team.code,
          name: team.name,
          leadName: team.leadName,
          phone: team.phone,
          vehicle: team.vehicle,
          status: team.status,
          members: team.members,
          base: team.base,
          skills: team.skills,
          lastSeenAt: team.lastSeenAt,
        }
      : {
          id: null,
          code: teamCode,
          name: teamCode,
          leadName: `${user.firstName} ${user.lastName}`,
          phone: user.phone,
          vehicle: 'Véhicule STEG',
          status: validActiveMission ? 'on_mission' : 'available',
          members: 2,
          base: user.delegation ?? 'District Tunis',
          skills: ['Réseau électrique'],
          lastSeenAt: validActiveMission?.lastPositionAt ?? null,
        },
    activeMission: validActiveMission
      ? maintenanceMission(validActiveMission, activeIncident, contact)
      : null,
    history: closedMissions.map((mission) =>
      historyItem(mission, byId.get(mission.incidentId) ?? null),
    ),
    notifications: maintenanceNotifications(
      validActiveMission,
      activeIncident,
    ),
  };
}

export async function findCitizenTracking(user: AuthUser) {
  const incidents = await Incident.find({
    $or: [
      { reportedByUserId: user.id },
      ...(user.contractNumber
        ? [{ contractNumber: user.contractNumber }]
        : []),
    ],
    status: { $nin: ['resolved', 'rejected'] },
  }).select('_id');
  const mission = await Mission.findOne({
    incidentId: { $in: incidents.map((incident) => String(incident._id)) },
    status: { $ne: 'closed' },
  }).sort({ updatedAt: -1 });
  if (!mission) {
    throw notFound('Aucune intervention active liée à votre compte.');
  }
  const coordinates = mission.lastPosition?.coordinates as
    | [number, number]
    | undefined;
  return {
    id: String(mission._id),
    reference: mission.reference,
    teamCode: mission.teamCode,
    status: mission.status,
    etaMinutes: mission.etaMinutes,
    diagnosis: mission.diagnosis,
    lastPositionAt: mission.lastPositionAt,
    approximatePosition: coordinates
      ? {
          longitude: Number(coordinates[0].toFixed(3)),
          latitude: Number(coordinates[1].toFixed(3)),
        }
      : null,
  };
}

export function findOperationsTracking() {
  return Mission.find({ status: { $ne: 'closed' } }).sort({ updatedAt: -1 });
}

export async function updateMissionPosition(
  id: string,
  payload: { latitude: number; longitude: number },
) {
  const mission = await findMission(id);
  const capturedAt = new Date();
  const incident = await Incident.findById(mission.incidentId);
  const target = incident?.location.coordinates as
    | [number, number]
    | undefined;
  const from: [number, number] = [payload.longitude, payload.latitude];
  const distanceKm = target ? distanceInKilometers(from, target) : null;
  const etaMinutes =
    distanceKm === null
      ? (mission.etaMinutes ?? 12)
      : Math.max(2, Math.ceil((distanceKm / 28) * 60));
  mission.lastPosition = { type: 'Point', coordinates: from };
  mission.lastPositionAt = capturedAt;
  mission.etaMinutes = etaMinutes;
  await Promise.all([
    mission.save(),
    FieldTeam.updateOne(
      { code: mission.teamCode },
      {
        location: mission.lastPosition,
        lastSeenAt: capturedAt,
      },
    ),
  ]);
  emitTeamPosition({
    missionId: String(mission._id),
    teamCode: mission.teamCode,
    latitude: payload.latitude,
    longitude: payload.longitude,
    etaMinutes,
    capturedAt: capturedAt.toISOString(),
  });
  return mission;
}

export async function updateMissionStatus(
  id: string,
  payload: { status: string; diagnosis?: string },
) {
  const mission = await findMission(id);
  const changedAt = new Date();
  mission.status = payload.status as any;
  mission.diagnosis = payload.diagnosis ?? mission.diagnosis;
  mission.statusHistory.push({
    status: payload.status as any,
    at: changedAt.toISOString(),
    source: mission.teamCode,
  });
  if (payload.status === 'accepted') mission.acceptedAt = changedAt;
  if (payload.status === 'en_route') mission.enRouteAt = changedAt;
  if (payload.status === 'on_site') mission.onSiteAt = changedAt;
  if (payload.status === 'restored') mission.restoredAt = changedAt;
  if (payload.status === 'closed') mission.closedAt = changedAt;

  const incident = await Incident.findById(mission.incidentId);
  if (incident) {
    if (
      ['on_site', 'diagnosing', 'repairing', 'testing'].includes(
        payload.status,
      )
    ) {
      incident.status = 'in_progress';
    }
    if (['restored', 'closed'].includes(payload.status)) {
      incident.status = 'resolved';
    }
    incident.activity.push({
      at: changedAt.toISOString(),
      label: `Mission ${mission.reference} — ${payload.status}`,
      actor: mission.teamCode,
    });
  }
  await Promise.all([
    mission.save(),
    incident?.save(),
    FieldTeam.updateOne(
      { code: mission.teamCode },
      payload.status === 'closed'
        ? { status: 'available', currentMissionId: null }
        : { status: 'on_mission', currentMissionId: String(mission._id) },
    ),
  ]);
  emitMissionStatus(String(mission._id), mission.status);
  return mission;
}

export async function updateMissionReport(
  id: string,
  payload: {
    diagnosis?: string;
    estimatedRepairMinutes?: number;
    notes?: string;
    requestedResources?: string[];
  },
) {
  const mission = await findMission(id);
  mission.diagnosis = payload.diagnosis ?? mission.diagnosis;
  mission.estimatedRepairMinutes =
    payload.estimatedRepairMinutes ?? mission.estimatedRepairMinutes;
  mission.reportNotes = payload.notes ?? mission.reportNotes;
  mission.requestedResources =
    payload.requestedResources ?? mission.requestedResources;
  await mission.save();
  emitMissionReport(String(mission._id), {
    diagnosis: mission.diagnosis,
    estimatedRepairMinutes: mission.estimatedRepairMinutes,
    requestedResources: mission.requestedResources,
    updatedAt: mission.updatedAt.toISOString(),
  });
  return mission;
}

export async function addMissionPhotos(id: string, urls: string[]) {
  const mission = await findMission(id);
  mission.photoUrls = [
    ...new Set([...mission.photoUrls, ...urls]),
  ].slice(0, 12);
  await mission.save();
  return mission;
}

export async function createMissionEmergency(
  id: string,
  payload: {
    type: string;
    note?: string;
    latitude?: number;
    longitude?: number;
  },
) {
  const mission = await findMission(id);
  const event = {
    type: payload.type,
    note: payload.note ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    createdAt: new Date().toISOString(),
  };
  mission.emergencyEvents = [...mission.emergencyEvents, event].slice(-20) as any;
  await mission.save();
  emitMissionEmergency(String(mission._id), mission.teamCode, event);
  return {
    missionId: String(mission._id),
    reference: mission.reference,
    event,
    message:
      'Alerte transmise au superviseur avec les informations de mission.',
  };
}

function maintenanceMission(mission: any, incident: any, contact: any) {
  const destination = incident.location.coordinates as [number, number];
  const teamPosition = mission.lastPosition?.coordinates as
    | [number, number]
    | undefined;
  const distanceKm = teamPosition
    ? distanceInKilometers(teamPosition, destination)
    : null;
  const contractNumber =
    contact?.contractNumber ?? incident.contractNumber ?? null;
  const initials = contact
    ? `${contact.firstName.slice(0, 1)}${contact.lastName.slice(0, 1)}`
    : 'CS';
  return {
    id: String(mission._id),
    reference: mission.reference,
    teamCode: mission.teamCode,
    incidentId: mission.incidentId,
    status: mission.status,
    etaMinutes: mission.etaMinutes,
    diagnosis: mission.diagnosis,
    estimatedRepairMinutes: mission.estimatedRepairMinutes,
    reportNotes: mission.reportNotes,
    photoUrls: mission.photoUrls,
    requestedResources: mission.requestedResources,
    statusHistory: mission.statusHistory,
    emergencyEvents: mission.emergencyEvents,
    lastPosition: mission.lastPosition,
    lastPositionAt: mission.lastPositionAt,
    acceptedAt: mission.acceptedAt,
    enRouteAt: mission.enRouteAt,
    onSiteAt: mission.onSiteAt,
    restoredAt: mission.restoredAt,
    closedAt: mission.closedAt,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
    elapsedMinutes: Math.max(
      0,
      Math.round(
        ((mission.closedAt ?? new Date()).getTime() -
          mission.createdAt.getTime()) /
          60_000,
      ),
    ),
    incident: {
      id: String(incident._id),
      reference: incident.reference,
      type: incident.type,
      description: incident.description,
      address: incident.address,
      severity: incident.severity,
      status: incident.status,
      photos: incident.photos,
      communityConfirmations: incident.communityConfirmations,
      location: incident.location,
      activity: incident.activity,
      createdAt: incident.createdAt,
    },
    contact: {
      name: contact
        ? `${contact.firstName} ${contact.lastName}`
        : 'Client STEG',
      initials,
      phone: contact?.phone ?? null,
      contractNumber,
      contractMasked: contractNumber
        ? `•••• ${contractNumber.slice(-4)}`
        : 'Non communiqué',
      address:
        contact?.address ??
        incident.address ??
        'Adresse rattachée au dossier',
    },
  };
}

function historyItem(mission: any, incident: any | null) {
  const completedAt = mission.closedAt ?? mission.updatedAt;
  return {
    id: String(mission._id),
    reference: mission.reference,
    incidentReference: incident?.reference ?? 'Incident réseau',
    incidentType: incident?.type ?? 'outage',
    address: incident?.address ?? 'Secteur non renseigné',
    severity: incident?.severity ?? 'medium',
    status: mission.status,
    diagnosis: mission.diagnosis,
    photoCount: mission.photoUrls?.length ?? 0,
    createdAt: mission.createdAt,
    completedAt,
    durationMinutes: Math.max(
      0,
      Math.round(
        (completedAt.getTime() - mission.createdAt.getTime()) / 60_000,
      ),
    ),
  };
}

function maintenanceNotifications(mission: any | null, incident: any | null) {
  if (!mission) {
    return [
      {
        id: 'team-available',
        type: 'availability',
        title: 'Équipe disponible',
        body: 'Le centre peut vous affecter une nouvelle mission.',
        createdAt: new Date().toISOString(),
        unread: false,
      },
    ];
  }
  const labels: Record<string, string> = {
    assigned: 'Mission affectée',
    accepted: 'Mission acceptée',
    en_route: 'Équipe en déplacement',
    on_site: 'Équipe sur place',
    diagnosing: 'Diagnostic en cours',
    repairing: 'Réparation en cours',
    testing: 'Tests de remise en service',
    restored: 'Courant rétabli',
    closed: 'Intervention clôturée',
  };
  const notifications = [
    {
      id: `mission-${mission._id}`,
      type: 'mission',
      title: `${mission.reference} — ${labels[mission.status] ?? 'Mission actualisée'}`,
      body: incident
        ? `${incident.reference} · ${incident.address}`
        : 'Dossier technique indisponible ; contactez le centre.',
      createdAt: mission.updatedAt,
      unread: true,
    },
  ];
  if (!mission.diagnosis && mission.status === 'diagnosing') {
    notifications.push({
      id: `diagnosis-${mission._id}`,
      type: 'report',
      title: 'Diagnostic attendu',
      body: 'Complétez le rapport avant de démarrer la réparation.',
      createdAt: mission.updatedAt,
      unread: true,
    });
  }
  return notifications;
}

function distanceInKilometers(
  from: [number, number],
  to: [number, number],
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLatitude = toRadians(to[1]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function assertMissionTransition(
  current: string,
  requested: string,
) {
  const order = [
    'assigned',
    'accepted',
    'en_route',
    'on_site',
    'diagnosing',
    'repairing',
    'testing',
    'restored',
    'closed',
  ];
  const currentIndex = order.indexOf(current);
  const requestedIndex = order.indexOf(requested);
  if (requestedIndex < currentIndex || requestedIndex > currentIndex + 1) {
    throw new HttpError(
      409,
      `Transition invalide : ${current} → ${requested}.`,
    );
  }
}
