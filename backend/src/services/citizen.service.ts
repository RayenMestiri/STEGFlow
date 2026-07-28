import {
  PUBLIC_OUTAGE_STATUSES,
  resolveOutageZone,
} from '../domain/constants.js';
import { CitizenConfirmation, Incident, Mission, Outage } from '../models/index.js';
import type { AuthUser } from '../types/auth.js';

function userZoneLabel(user: AuthUser) {
  return (
    user.district ??
    user.delegation ??
    (user.address ? generalizeAddress(user.address) : null) ??
    'Adresse non renseignée'
  );
}

function hasGeographicProfile(user: AuthUser) {
  return Boolean(
    user.district ||
      user.delegation ||
      user.address ||
      (user.latitude !== null && user.longitude !== null),
  );
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function generalizeAddress(address: string) {
  const parts = address.split(',').map((part) => part.trim());
  return parts.length > 1 ? parts.at(-1)! : address;
}

function matchesUserZone(value: string, user: AuthUser) {
  const normalized = normalize(value);
  return [
    user.district,
    user.delegation,
    user.address ? generalizeAddress(user.address) : null,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .some((entry) => {
      const candidate = normalize(entry);
      return candidate.length >= 4 && normalized.includes(candidate);
    });
}

function publicOutage(outage: any) {
  const zone = resolveOutageZone(outage.zoneId, outage.zoneLabel);
  return {
    id: String(outage._id),
    reference: outage.reference,
    zoneId: outage.zoneId,
    zoneLabel: outage.zoneLabel,
    reason: outage.reason,
    status: outage.status,
    startsAt: outage.startsAt,
    durationMinutes: outage.durationMinutes,
    affectedCustomers: outage.affectedCustomers,
    longitude: outage.longitude ?? zone?.longitude ?? 10.1815,
    latitude: outage.latitude ?? zone?.latitude ?? 36.8065,
    updatedAt: outage.updatedAt,
  };
}

function citizenMission(mission: any) {
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

function buildTimeline(incident: any | null, mission: any | null) {
  if (!incident && !mission) return [];
  const steps = [
    ['reported', 'Signalement reçu'],
    ['confirmed', 'Panne confirmée'],
    ['assigned', 'Équipe affectée'],
    ['en_route', 'En déplacement'],
    ['on_site', 'Sur place'],
    ['diagnosing', 'Diagnostic'],
    ['repairing', 'Réparation & tests'],
    ['restored', 'Courant rétabli'],
  ];
  let activeIndex = 0;
  if (mission) {
    activeIndex =
      (
        {
          assigned: 2,
          accepted: 2,
          en_route: 3,
          on_site: 4,
          diagnosing: 5,
          repairing: 6,
          testing: 6,
          restored: 7,
          closed: 7,
        } as Record<string, number>
      )[mission.status] ?? 2;
  } else if (incident) {
    if (incident.status === 'dispatched') activeIndex = 2;
    else if (incident.status === 'verified') activeIndex = 1;
  }
  return steps.map(([key, label], index) => ({
    key,
    label,
    state:
      index < activeIndex
        ? 'completed'
        : index === activeIndex
          ? 'current'
          : 'upcoming',
    at:
      index === activeIndex
        ? (mission?.updatedAt ?? incident?.updatedAt ?? null)
        : index < activeIndex
          ? (incident?.createdAt ?? mission?.createdAt ?? null)
          : null,
  }));
}

function buildNotifications(
  mission: any | null,
  outage: any | null,
  incident: any | null,
) {
  const items: Array<Record<string, unknown>> = [];
  if (mission) {
    items.push({
      id: `mission-${mission._id}`,
      type: 'mission',
      title: `${mission.teamCode} suit votre signalement`,
      body:
        mission.status === 'en_route'
          ? `Arrivée estimée dans ${mission.etaMinutes ?? 12} minutes.`
          : `Intervention : ${mission.status}.`,
      createdAt: mission.updatedAt,
      unread: true,
    });
  }
  if (outage) {
    items.push({
      id: `outage-${outage._id}`,
      type: 'outage',
      title: `Information réseau — ${outage.zoneLabel}`,
      body: `${outage.reason} · durée estimée ${outage.durationMinutes} minutes.`,
      createdAt: outage.updatedAt,
      unread: true,
    });
  }
  if (incident) {
    items.push({
      id: `incident-${incident._id}`,
      type: 'report',
      title: `Signalement ${incident.reference} pris en compte`,
      body: `${incident.communityConfirmations} confirmation(s) enregistrée(s).`,
      createdAt: incident.updatedAt,
      unread: false,
    });
  }
  return items;
}

function estimatedRestorationAt(outage: any | null, mission: any | null) {
  if (outage) {
    return new Date(
      new Date(outage.startsAt).getTime() + outage.durationMinutes * 60_000,
    );
  }
  if (!mission) return null;
  return new Date(
    Date.now() + ((mission.etaMinutes ?? 12) + 55) * 60_000,
  );
}

export async function getCitizenDashboard(user: AuthUser) {
  const [outages, incidents, activeMissions, contributions] = await Promise.all([
    Outage.find({ status: { $in: PUBLIC_OUTAGE_STATUSES } }).sort({
      startsAt: 1,
    }),
    Incident.find().sort({ createdAt: -1 }),
    Mission.find({ status: { $ne: 'closed' } }).sort({ updatedAt: -1 }),
    CitizenConfirmation.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(12),
  ]);

  const zoneLabel = userZoneLabel(user);
  const myReports = incidents
    .filter((incident) => incident.reportedByUserId === user.id)
    .slice(0, 10);
  const currentIncident =
    myReports.find(
      (incident) =>
        !['resolved', 'rejected'].includes(String(incident.status)),
    ) ?? null;
  const zoneOutages = hasGeographicProfile(user)
    ? outages.filter((outage) => matchesUserZone(outage.zoneLabel, user))
    : [];
  const currentOutage =
    zoneOutages.find((outage) =>
      ['active', 'notified'].includes(String(outage.status)),
    ) ??
    zoneOutages.find((outage) => outage.status === 'scheduled') ??
    null;
  const mission = currentIncident
    ? (activeMissions.find(
        (candidate) =>
          candidate.incidentId === String(currentIncident._id),
      ) ?? null)
    : null;
  const outageConfirmationCount = currentOutage
    ? await CitizenConfirmation.countDocuments({
        zoneId: currentOutage.zoneId,
        kind: 'outage_confirmed',
      })
    : 0;
  const latestRestoration = contributions.find(
    (item) => item.kind === 'power_restored',
  );
  const state = mission
    ? 'intervention_in_progress'
    : currentIncident
      ? 'outage_confirmed'
      : currentOutage?.status === 'active'
        ? 'outage_confirmed'
        : currentOutage &&
            ['scheduled', 'notified'].includes(String(currentOutage.status))
          ? 'scheduled'
          : 'normal';
  const generatedAt = new Date();

  return {
    generatedAt: generatedAt.toISOString(),
    profile: {
      firstName: user.firstName,
      contractNumber: user.contractNumber,
      address: user.address ?? 'Adresse non renseignée',
      district: zoneLabel,
      governorate: user.governorate ?? 'Non renseigné',
      latitude: user.latitude ?? 36.8065,
      longitude: user.longitude ?? 10.1815,
    },
    situation: {
      state,
      zoneId: currentOutage?.zoneId ?? `profile-${user.id}`,
      zoneLabel: currentOutage?.zoneLabel ?? zoneLabel,
      cause:
        mission?.diagnosis ??
        currentIncident?.description ??
        currentOutage?.reason ??
        'Aucun incident réseau confirmé dans votre secteur.',
      affectedCustomers:
        currentOutage?.affectedCustomers ?? (currentIncident ? 1 : 0),
      communityConfirmations:
        currentIncident?.communityConfirmations ?? outageConfirmationCount,
      estimatedRestorationAt: estimatedRestorationAt(
        currentOutage,
        mission,
      ),
      lastUpdatedAt:
        mission?.lastPositionAt ??
        currentIncident?.updatedAt ??
        currentOutage?.updatedAt ??
        generatedAt,
      powerRestoredConfirmedAt: latestRestoration?.createdAt ?? null,
    },
    currentOutage: currentOutage ? publicOutage(currentOutage) : null,
    mission: mission ? citizenMission(mission) : null,
    timeline: buildTimeline(currentIncident, mission),
    upcomingOutages: zoneOutages
      .filter((outage) =>
        ['scheduled', 'notified'].includes(String(outage.status)),
      )
      .slice(0, 4)
      .map(publicOutage),
    myReports: myReports.map((incident) => ({
      id: String(incident._id),
      reference: incident.reference,
      type: incident.type,
      address: incident.address,
      severity: incident.severity,
      status: incident.status,
      assignedTeamCode: incident.assignedTeamCode,
      communityConfirmations: incident.communityConfirmations,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    })),
    notifications: buildNotifications(
      mission,
      currentOutage,
      currentIncident,
    ),
  };
}

export async function getCitizenMap(user: AuthUser) {
  const [outages, incidents] = await Promise.all([
    Outage.find({ status: { $in: PUBLIC_OUTAGE_STATUSES } }).sort({
      startsAt: 1,
    }),
    Incident.find({ status: { $ne: 'rejected' } })
      .sort({ updatedAt: -1 })
      .limit(20),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    center: {
      longitude: user.longitude ?? 10.1815,
      latitude: user.latitude ?? 36.826,
    },
    outages: outages.map(publicOutage),
    incidents: incidents.map((incident) => {
      const coordinates = incident.location.coordinates as [number, number];
      return {
        id: String(incident._id),
        reference: incident.reference,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        zoneLabel: generalizeAddress(incident.address),
        communityConfirmations: incident.communityConfirmations,
        longitude: Number(coordinates[0].toFixed(3)),
        latitude: Number(coordinates[1].toFixed(3)),
        updatedAt: incident.updatedAt,
      };
    }),
  };
}

export function getCitizenSafety() {
  return {
    generatedAt: new Date().toISOString(),
    emergency: {
      label: 'Urgence STEG',
      phone: '80100444',
      displayPhone: '80 100 444',
      description:
        'Fuite de gaz, câble à terre, étincelles ou panne touchant plusieurs clients.',
    },
    service: {
      label: 'Services & réclamations',
      phone: '71239222',
      displayPhone: '71 239 222',
      description:
        'Renseignements, suivi d’une demande et rétablissement électricité ou gaz.',
    },
    guides: [
      {
        id: 'fallen-wire',
        icon: 'cable',
        title: 'Câble tombé ou arraché',
        summary:
          'Restez à distance et empêchez toute personne de s’approcher.',
        steps: [
          'Ne touchez jamais le câble, même avec un objet isolant.',
          'Éloignez-vous d’au moins dix mètres.',
          'Signalez immédiatement la position depuis l’application.',
        ],
        tone: 'danger',
      },
      {
        id: 'meter-fire',
        icon: 'flame',
        title: 'Compteur, fumée ou étincelles',
        summary:
          'Coupez le disjoncteur uniquement si vous pouvez le faire sans danger.',
        steps: [
          'N’utilisez jamais d’eau sur une installation électrique.',
          'Évacuez la zone en présence de fumée ou de feu.',
          'Appelez le numéro d’urgence STEG.',
        ],
        tone: 'warning',
      },
      {
        id: 'home-outage',
        icon: 'house-plug',
        title: 'Coupure limitée au logement',
        summary:
          'Vérifiez votre installation avant de créer un signalement réseau.',
        steps: [
          'Vérifiez le disjoncteur principal sans démonter le compteur.',
          'Demandez à un voisin si son logement est alimenté.',
          'Signalez le problème si la coupure touche plusieurs adresses.',
        ],
        tone: 'info',
      },
      {
        id: 'voltage',
        icon: 'activity',
        title: 'Tension instable',
        summary:
          'Protégez les appareils sensibles et documentez les variations.',
        steps: [
          'Débranchez les appareils électroniques sensibles.',
          'Ne manipulez pas le compteur ni les plombs STEG.',
          'Créez un signalement avec une description précise.',
        ],
        tone: 'violet',
      },
    ],
    faqs: [
      {
        id: 'planned',
        question: 'Comment reconnaître une coupure programmée ?',
        answer:
          'Elle apparaît sur la carte avec sa plage horaire, la zone réseau et le motif validé par la STEG.',
      },
      {
        id: 'private',
        question: 'Ma position GPS est-elle publique ?',
        answer:
          'Non. Elle sert uniquement à localiser le signalement ; la carte citoyenne affiche des positions approximatives.',
      },
      {
        id: 'team',
        question: 'Pourquoi la position de l’équipe est-elle approximative ?',
        answer:
          'Le suivi est volontairement retardé et arrondi afin de protéger les agents tout en donnant une estimation fiable.',
      },
      {
        id: 'report',
        question: 'Quand faut-il joindre une photo ?',
        answer:
          'Uniquement si vous pouvez la prendre sans vous approcher d’un câble, d’un coffret dangereux ou d’une zone de feu.',
      },
    ],
    officialSource:
      'https://www.steg.com.tn/fr/centre-national-des-services-a-distance',
  };
}

export async function confirmCitizenSituation(
  user: AuthUser,
  payload: {
    kind: 'outage_confirmed' | 'power_restored';
    zoneId: string;
    outageId?: string;
    incidentId?: string;
    note?: string;
  },
) {
  const filter = {
    userId: user.id,
    zoneId: payload.zoneId,
    kind: payload.kind,
    outageId: payload.outageId ?? null,
    incidentId: payload.incidentId ?? null,
  };
  let confirmation = await CitizenConfirmation.findOne(filter);
  const existed = Boolean(confirmation);
  confirmation ??= await CitizenConfirmation.create({
    ...filter,
    contractNumber: user.contractNumber,
    note: payload.note ?? null,
  });

  if (
    !existed &&
    payload.kind === 'outage_confirmed' &&
    payload.incidentId
  ) {
    await Incident.updateOne(
      { _id: payload.incidentId },
      { $inc: { communityConfirmations: 1 } },
    );
  }
  const restored = payload.kind === 'power_restored';
  return {
    id: String(confirmation._id),
    kind: confirmation.kind,
    zoneId: confirmation.zoneId,
    createdAt: confirmation.createdAt,
    message: existed
      ? restored
        ? 'Votre confirmation de rétablissement était déjà enregistrée.'
        : 'Votre confirmation de coupure est déjà prise en compte dans cette zone.'
      : restored
        ? 'Votre confirmation de rétablissement a été enregistrée.'
        : 'Votre confirmation de coupure a été ajoutée à la zone.',
  };
}
