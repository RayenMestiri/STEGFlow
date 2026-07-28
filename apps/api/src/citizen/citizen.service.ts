import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { IncidentEntity, IncidentStatus } from '../incidents/incident.entity';
import { MissionEntity, MissionStatus } from '../missions/mission.entity';
import { OutageEntity, OutageStatus } from '../outages/outage.entity';
import {
  CitizenConfirmationEntity,
  CitizenConfirmationKind,
} from './citizen-confirmation.entity';
import { CreateCitizenConfirmationDto } from './citizen.dto';

const PUBLIC_OUTAGE_STATUSES = [
  OutageStatus.SCHEDULED,
  OutageStatus.NOTIFIED,
  OutageStatus.ACTIVE,
  OutageStatus.RESTORED,
  OutageStatus.CLOSED,
];

const ZONE_COORDINATES: Record<string, [number, number]> = {
  'zone-el-menzah-6-a3': [10.1764, 36.8427],
  'zone-le-bardo-b1': [10.1346, 36.8094],
  'zone-la-marsa-hta': [10.3303, 36.8782],
  'zone-cite-ennasr-2': [10.1635, 36.8667],
};

@Injectable()
export class CitizenService {
  constructor(
    @InjectRepository(OutageEntity)
    private readonly outages: Repository<OutageEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(CitizenConfirmationEntity)
    private readonly confirmations: Repository<CitizenConfirmationEntity>,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    const [outages, incidents, mission, contributions] = await Promise.all([
      this.outages.find({
        where: { status: In(PUBLIC_OUTAGE_STATUSES) },
        order: { startsAt: 'ASC' },
      }),
      this.incidents.find({ order: { createdAt: 'DESC' } }),
      this.missions.findOne({
        where: { status: Not(MissionStatus.CLOSED) },
        order: { updatedAt: 'DESC' },
      }),
      this.confirmations.find({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
        take: 12,
      }),
    ]);

    const userZone = user.district ?? user.delegation ?? 'El Menzah 6';
    const zoneOutages = outages.filter((outage) =>
      this.matchesUserZone(outage.zoneLabel, user),
    );
    const currentOutage =
      zoneOutages.find((outage) =>
        [OutageStatus.ACTIVE, OutageStatus.NOTIFIED].includes(outage.status),
      ) ??
      zoneOutages.find((outage) => outage.status === OutageStatus.SCHEDULED) ??
      null;
    const zoneIncidents = incidents.filter((incident) =>
      this.matchesUserZone(incident.address, user),
    );
    const currentIncident =
      zoneIncidents.find(
        (incident) =>
          ![IncidentStatus.RESOLVED, IncidentStatus.REJECTED].includes(
            incident.status,
          ),
      ) ?? null;
    const outageConfirmationCount = await this.confirmations.count({
      where: {
        zoneId:
          currentOutage?.zoneId ??
          'zone-el-menzah-6-a3',
        kind: CitizenConfirmationKind.OUTAGE_CONFIRMED,
      },
    });
    const myReports = incidents
      .filter(
        (incident) =>
          (user.contractNumber &&
            incident.contractNumber === user.contractNumber) ||
          this.matchesUserZone(incident.address, user),
      )
      .slice(0, 5);
    const latestRestoration = contributions.find(
      (item) => item.kind === CitizenConfirmationKind.POWER_RESTORED,
    );
    const situationState = mission
      ? 'intervention_in_progress'
      : currentOutage?.status === OutageStatus.ACTIVE
        ? 'outage_confirmed'
        : currentOutage
          ? 'scheduled'
          : 'normal';

    return {
      generatedAt: new Date().toISOString(),
      profile: {
        firstName: user.firstName,
        contractNumber: user.contractNumber,
        address: user.address ?? userZone,
        district: userZone,
        governorate: user.governorate ?? 'Tunis',
        latitude: user.latitude ?? 36.8427,
        longitude: user.longitude ?? 10.1764,
      },
      situation: {
        state: situationState,
        zoneId: currentOutage?.zoneId ?? 'zone-el-menzah-6-a3',
        zoneLabel: currentOutage?.zoneLabel ?? userZone,
        cause:
          mission?.diagnosis ??
          currentIncident?.description ??
          'Incident réseau confirmé, diagnostic technique en cours.',
        affectedCustomers: currentOutage?.affectedCustomers ?? 1842,
        communityConfirmations: zoneIncidents.reduce(
          (total, incident) => total + incident.communityConfirmations,
          outageConfirmationCount,
        ),
        estimatedRestorationAt: this.estimatedRestorationAt(
          currentOutage,
          mission,
        ),
        lastUpdatedAt:
          mission?.lastPositionAt ??
          currentIncident?.updatedAt ??
          currentOutage?.updatedAt ??
          new Date(),
        powerRestoredConfirmedAt: latestRestoration?.createdAt ?? null,
      },
      currentOutage: currentOutage
        ? this.toPublicOutage(currentOutage)
        : null,
      mission: mission ? this.toCitizenMission(mission) : null,
      timeline: this.buildTimeline(mission),
      upcomingOutages: outages
        .filter((outage) =>
          [OutageStatus.SCHEDULED, OutageStatus.NOTIFIED].includes(
            outage.status,
          ),
        )
        .slice(0, 4)
        .map((outage) => this.toPublicOutage(outage)),
      myReports: myReports.map((incident) => ({
        id: incident.id,
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
      notifications: this.buildNotifications(
        mission,
        currentOutage,
        currentIncident,
      ),
    };
  }

  async getMap(user: AuthenticatedUser) {
    const [outages, incidents] = await Promise.all([
      this.outages.find({
        where: { status: In(PUBLIC_OUTAGE_STATUSES) },
        order: { startsAt: 'ASC' },
      }),
      this.incidents.find({
        where: { status: Not(IncidentStatus.REJECTED) },
        order: { updatedAt: 'DESC' },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      center: {
        longitude: user.longitude ?? 10.1815,
        latitude: user.latitude ?? 36.826,
      },
      outages: outages.map((outage) => this.toPublicOutage(outage)),
      incidents: incidents.slice(0, 20).map((incident) => {
        const point = incident.location as {
          coordinates?: [number, number];
        } | null;
        const [longitude, latitude] =
          point?.coordinates ?? [10.1815, 36.826];
        return {
          id: incident.id,
          reference: incident.reference,
          type: incident.type,
          severity: incident.severity,
          status: incident.status,
          zoneLabel: this.generalizeAddress(incident.address),
          communityConfirmations: incident.communityConfirmations,
          longitude: Number(longitude.toFixed(3)),
          latitude: Number(latitude.toFixed(3)),
          updatedAt: incident.updatedAt,
        };
      }),
    };
  }

  getSafety() {
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
          summary: 'Restez à distance et empêchez toute personne de s’approcher.',
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
          summary: 'Coupez le disjoncteur uniquement si vous pouvez le faire sans danger.',
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
          summary: 'Vérifiez votre installation avant de créer un signalement réseau.',
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
          summary: 'Protégez les appareils sensibles et documentez les variations.',
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

  async confirm(
    user: AuthenticatedUser,
    dto: CreateCitizenConfirmationDto,
  ) {
    const existingConfirmation = await this.confirmations.findOne({
      where: {
        userId: user.id,
        zoneId: dto.zoneId,
        kind: dto.kind,
        outageId: dto.outageId ?? IsNull(),
        incidentId: dto.incidentId ?? IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (existingConfirmation) {
      return {
        id: existingConfirmation.id,
        kind: existingConfirmation.kind,
        zoneId: existingConfirmation.zoneId,
        createdAt: existingConfirmation.createdAt,
        message:
          dto.kind === CitizenConfirmationKind.POWER_RESTORED
            ? 'Votre confirmation de rétablissement était déjà enregistrée.'
            : 'Votre confirmation de coupure est déjà prise en compte dans cette zone.',
      };
    }

    const confirmation = await this.confirmations.save(
      this.confirmations.create({
        userId: user.id,
        contractNumber: user.contractNumber,
        zoneId: dto.zoneId,
        kind: dto.kind,
        outageId: dto.outageId ?? null,
        incidentId: dto.incidentId ?? null,
        note: dto.note ?? null,
      }),
    );

    if (
      dto.kind === CitizenConfirmationKind.OUTAGE_CONFIRMED &&
      dto.incidentId
    ) {
      const incident = await this.incidents.findOneBy({ id: dto.incidentId });
      if (incident) {
        incident.communityConfirmations += 1;
        await this.incidents.save(incident);
      }
    }

    return {
      id: confirmation.id,
      kind: confirmation.kind,
      zoneId: confirmation.zoneId,
      createdAt: confirmation.createdAt,
      message:
        dto.kind === CitizenConfirmationKind.POWER_RESTORED
          ? 'Votre confirmation de rétablissement a été enregistrée.'
          : 'Votre confirmation de coupure a été ajoutée à la zone.',
    };
  }

  private toPublicOutage(outage: OutageEntity) {
    const [longitude, latitude] =
      ZONE_COORDINATES[outage.zoneId] ?? [10.1815, 36.826];
    return {
      id: outage.id,
      reference: outage.reference,
      zoneId: outage.zoneId,
      zoneLabel: outage.zoneLabel,
      reason: outage.reason,
      status: outage.status,
      startsAt: outage.startsAt,
      durationMinutes: outage.durationMinutes,
      affectedCustomers: outage.affectedCustomers,
      longitude,
      latitude,
      updatedAt: outage.updatedAt,
    };
  }

  private toCitizenMission(mission: MissionEntity) {
    const point = mission.lastPosition as {
      coordinates?: [number, number];
    } | null;
    const coordinates = point?.coordinates;
    return {
      id: mission.id,
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

  private buildTimeline(mission: MissionEntity | null) {
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
    const activeIndex = mission
      ? ({
          assigned: 2,
          accepted: 2,
          en_route: 3,
          on_site: 4,
          diagnosing: 5,
          repairing: 6,
          testing: 6,
          restored: 7,
          closed: 7,
        }[mission.status] ?? 1)
      : 1;
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
          ? mission?.updatedAt ?? new Date()
          : index < activeIndex
            ? mission?.createdAt ?? new Date()
            : null,
    }));
  }

  private buildNotifications(
    mission: MissionEntity | null,
    outage: OutageEntity | null,
    incident: IncidentEntity | null,
  ) {
    const items: Array<Record<string, unknown>> = [];
    if (mission) {
      items.push({
        id: `mission-${mission.id}`,
        type: 'mission',
        title: `${mission.teamCode} suit votre zone`,
        body:
          mission.status === MissionStatus.EN_ROUTE
            ? `Arrivée estimée dans ${mission.etaMinutes ?? 12} minutes.`
            : `Intervention : ${mission.status}.`,
        createdAt: mission.updatedAt,
        unread: true,
      });
    }
    if (outage) {
      items.push({
        id: `outage-${outage.id}`,
        type: 'outage',
        title: `Information réseau — ${outage.zoneLabel}`,
        body: `${outage.reason} · durée estimée ${outage.durationMinutes} minutes.`,
        createdAt: outage.updatedAt,
        unread: true,
      });
    }
    if (incident) {
      items.push({
        id: `incident-${incident.id}`,
        type: 'report',
        title: `Signalement ${incident.reference} pris en compte`,
        body: `${incident.communityConfirmations} confirmation(s) dans la zone.`,
        createdAt: incident.updatedAt,
        unread: false,
      });
    }
    return items;
  }

  private estimatedRestorationAt(
    outage: OutageEntity | null,
    mission: MissionEntity | null,
  ) {
    if (outage) {
      return new Date(
        outage.startsAt.getTime() + outage.durationMinutes * 60_000,
      );
    }
    return new Date(
      Date.now() + ((mission?.etaMinutes ?? 12) + 55) * 60_000,
    );
  }

  private matchesUserZone(value: string, user: AuthenticatedUser) {
    const normalized = this.normalize(value);
    return [user.district, user.delegation, user.address]
      .filter((entry): entry is string => Boolean(entry))
      .some((entry) => {
        const candidate = this.normalize(entry);
        return normalized.includes(candidate) || candidate.includes(normalized);
      });
  }

  private generalizeAddress(address: string) {
    const parts = address.split(',').map((part) => part.trim());
    return parts.length > 1 ? parts.at(-1)! : address;
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
