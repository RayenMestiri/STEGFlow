import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { FieldTeamEntity, FieldTeamStatus } from '../admin/admin.entity';
import { AuthenticatedUser } from '../auth/auth.types';
import { UserEntity } from '../auth/user.entity';
import { IncidentEntity, IncidentStatus } from '../incidents/incident.entity';
import { MissionEntity, MissionStatus } from './mission.entity';
import {
  AddMissionPhotosDto,
  CreateMissionEmergencyDto,
  UpdateMissionReportDto,
  UpdateMissionStatusDto,
  UpdatePositionDto,
} from './missions.dto';
import { MissionsGateway } from './missions.gateway';

@Injectable()
export class MissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(FieldTeamEntity)
    private readonly teams: Repository<FieldTeamEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly gateway: MissionsGateway,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (
      this.config.get('SEED_DEMO_DATA', 'true') === 'true' &&
      (await this.missions.count()) === 0
    ) {
      const createdAt = new Date().toISOString();
      await this.missions.save(
        this.missions.create({
          reference: 'INT-2048',
          teamCode: 'Équipe 12',
          incidentId: '00000000-0000-4000-8000-000000002048',
          status: MissionStatus.EN_ROUTE,
          lastPosition: { type: 'Point', coordinates: [10.1764, 36.8427] },
          lastPositionAt: new Date(),
          etaMinutes: 12,
          diagnosis: null,
          estimatedRepairMinutes: null,
          reportNotes: null,
          photoUrls: [],
          requestedResources: [],
          emergencyEvents: [],
          statusHistory: [
            {
              status: MissionStatus.ASSIGNED,
              at: createdAt,
              source: 'Centre des opérations',
            },
            {
              status: MissionStatus.ACCEPTED,
              at: createdAt,
              source: 'Équipe 12',
            },
            {
              status: MissionStatus.EN_ROUTE,
              at: createdAt,
              source: 'Équipe 12',
            },
          ],
          acceptedAt: new Date(),
          enRouteAt: new Date(),
          onSiteAt: null,
          restoredAt: null,
          closedAt: null,
        }),
      );
    }

    await this.reconcileClosedMissionTeams();
  }

  async findOne(id: string) {
    const mission = await this.missions.findOneBy({ id });
    if (!mission) throw new NotFoundException('Mission introuvable');
    return mission;
  }

  async findCurrent(teamCode: string) {
    const mission = await this.missions.findOne({
      where: { teamCode, status: Not(MissionStatus.CLOSED) },
      order: { updatedAt: 'DESC' },
    });
    if (!mission) throw new NotFoundException('Aucune mission active pour cette équipe.');
    return mission;
  }

  async findHistory(teamCode: string) {
    const missions = await this.missions.find({
      where: { teamCode },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
    const incidentIds = [...new Set(missions.map((mission) => mission.incidentId))];
    const incidents = incidentIds.length
      ? await this.incidents.findBy({ id: In(incidentIds) })
      : [];
    const incidentsById = new Map(
      incidents.map((incident) => [incident.id, incident]),
    );
    return missions.map((mission) =>
      this.toHistoryItem(mission, incidentsById.get(mission.incidentId) ?? null),
    );
  }

  async findMaintenanceDashboard(user: AuthenticatedUser) {
    const teamCode = user.teamCode ?? 'Équipe 12';
    const [team, activeMission, missions] = await Promise.all([
      this.teams.findOneBy({ code: teamCode }),
      this.missions.findOne({
        where: { teamCode, status: Not(MissionStatus.CLOSED) },
        order: { updatedAt: 'DESC' },
      }),
      this.missions.find({
        where: { teamCode },
        order: { updatedAt: 'DESC' },
        take: 20,
      }),
    ]);
    const incidentIds = [
      ...new Set(
        [activeMission, ...missions]
          .filter((mission): mission is MissionEntity => Boolean(mission))
          .map((mission) => mission.incidentId),
      ),
    ];
    const incidents = incidentIds.length
      ? await this.incidents.findBy({ id: In(incidentIds) })
      : [];
    const incidentsById = new Map(
      incidents.map((incident) => [incident.id, incident]),
    );
    const activeIncident = activeMission
      ? incidentsById.get(activeMission.incidentId) ?? null
      : null;
    const contact =
      activeIncident?.contractNumber
        ? await this.users.findOneBy({
            contractNumber: activeIncident.contractNumber,
          })
        : null;

    return {
      generatedAt: new Date().toISOString(),
      team: team
        ? {
            id: team.id,
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
            status: activeMission
              ? FieldTeamStatus.ON_MISSION
              : FieldTeamStatus.AVAILABLE,
            members: 2,
            base: user.delegation ?? 'District Tunis',
            skills: ['Réseau électrique'],
            lastSeenAt: activeMission?.lastPositionAt ?? null,
          },
      activeMission: activeMission
        ? this.toMaintenanceMission(activeMission, activeIncident, contact)
        : null,
      history: missions.map((mission) =>
        this.toHistoryItem(
          mission,
          incidentsById.get(mission.incidentId) ?? null,
        ),
      ),
      notifications: this.buildMaintenanceNotifications(
        activeMission,
        activeIncident,
      ),
    };
  }

  async findCitizenTracking() {
    const mission = await this.missions.findOne({
      where: { status: Not(MissionStatus.CLOSED) },
      order: { updatedAt: 'DESC' },
    });
    if (!mission) throw new NotFoundException('Aucune intervention active dans votre zone.');
    const point = mission.lastPosition as { coordinates?: [number, number] } | null;
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

  async findOperationsTracking() {
    return this.missions.find({
      where: { status: Not(MissionStatus.CLOSED) },
      order: { updatedAt: 'DESC' },
    });
  }

  async updatePosition(id: string, dto: UpdatePositionDto) {
    const mission = await this.findOne(id);
    mission.lastPosition = {
      type: 'Point',
      coordinates: [dto.longitude, dto.latitude],
    };
    const capturedAt = new Date();
    const incident = await this.incidents.findOneBy({
      id: mission.incidentId,
    });
    const incidentPoint = incident?.location as {
      coordinates?: [number, number];
    } | null;
    const distanceKm = incidentPoint?.coordinates
      ? this.distanceInKilometers(
          [dto.longitude, dto.latitude],
          incidentPoint.coordinates,
        )
      : null;
    const etaMinutes =
      distanceKm === null ? (mission.etaMinutes ?? 12) : Math.max(2, Math.ceil((distanceKm / 28) * 60));
    mission.lastPositionAt = capturedAt;
    mission.etaMinutes = etaMinutes;
    const team = await this.teams.findOneBy({ code: mission.teamCode });
    if (team) {
      team.location = mission.lastPosition;
      team.lastSeenAt = capturedAt;
    }
    const [saved] = await Promise.all([
      this.missions.save(mission),
      team ? this.teams.save(team) : Promise.resolve(null),
    ]);
    this.gateway.broadcastPosition({
      missionId: saved.id,
      teamCode: saved.teamCode,
      latitude: dto.latitude,
      longitude: dto.longitude,
      etaMinutes,
      capturedAt: capturedAt.toISOString(),
    });
    return saved;
  }

  async updateStatus(id: string, dto: UpdateMissionStatusDto) {
    const mission = await this.findOne(id);
    mission.status = dto.status;
    mission.diagnosis = dto.diagnosis ?? mission.diagnosis;
    const changedAt = new Date();
    mission.statusHistory = [
      ...(mission.statusHistory ?? []),
      {
        status: dto.status,
        at: changedAt.toISOString(),
        source: mission.teamCode,
      },
    ];
    if (dto.status === MissionStatus.ACCEPTED) mission.acceptedAt = changedAt;
    if (dto.status === MissionStatus.EN_ROUTE) mission.enRouteAt = changedAt;
    if (dto.status === MissionStatus.ON_SITE) mission.onSiteAt = changedAt;
    if (dto.status === MissionStatus.RESTORED) mission.restoredAt = changedAt;
    if (dto.status === MissionStatus.CLOSED) mission.closedAt = changedAt;

    const [incident, team] = await Promise.all([
      this.incidents.findOneBy({ id: mission.incidentId }),
      this.teams.findOneBy({ code: mission.teamCode }),
    ]);
    if (incident) {
      if (
        [
          MissionStatus.ON_SITE,
          MissionStatus.DIAGNOSING,
          MissionStatus.REPAIRING,
          MissionStatus.TESTING,
        ].includes(dto.status)
      ) {
        incident.status = IncidentStatus.IN_PROGRESS;
      }
      if (
        [MissionStatus.RESTORED, MissionStatus.CLOSED].includes(dto.status)
      ) {
        incident.status = IncidentStatus.RESOLVED;
      }
      incident.activity = [
        ...(incident.activity ?? []),
        {
          at: changedAt.toISOString(),
          label: `Mission ${mission.reference} — ${dto.status}`,
          actor: mission.teamCode,
        },
      ];
    }
    if (team) {
      if (dto.status === MissionStatus.CLOSED) {
        team.status = FieldTeamStatus.AVAILABLE;
        team.currentMissionId = null;
      } else {
        team.status = FieldTeamStatus.ON_MISSION;
        team.currentMissionId = mission.id;
      }
    }

    const [saved] = await Promise.all([
      this.missions.save(mission),
      incident ? this.incidents.save(incident) : Promise.resolve(null),
      team ? this.teams.save(team) : Promise.resolve(null),
    ]);
    this.gateway.broadcastStatus(saved.id, saved.status);
    return saved;
  }

  async updateReport(id: string, dto: UpdateMissionReportDto) {
    const mission = await this.findOne(id);
    mission.diagnosis = dto.diagnosis ?? mission.diagnosis;
    mission.estimatedRepairMinutes =
      dto.estimatedRepairMinutes ?? mission.estimatedRepairMinutes;
    mission.reportNotes = dto.notes ?? mission.reportNotes;
    mission.requestedResources =
      dto.requestedResources ?? mission.requestedResources;
    const saved = await this.missions.save(mission);
    this.gateway.broadcastReport(saved.id, {
      diagnosis: saved.diagnosis,
      estimatedRepairMinutes: saved.estimatedRepairMinutes,
      requestedResources: saved.requestedResources,
      updatedAt: saved.updatedAt.toISOString(),
    });
    return saved;
  }

  async addPhotos(id: string, dto: AddMissionPhotosDto) {
    const mission = await this.findOne(id);
    mission.photoUrls = [
      ...new Set([...(mission.photoUrls ?? []), ...dto.urls]),
    ].slice(0, 12);
    return this.missions.save(mission);
  }

  async createEmergency(id: string, dto: CreateMissionEmergencyDto) {
    const mission = await this.findOne(id);
    const event = {
      type: dto.type,
      note: dto.note ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      createdAt: new Date().toISOString(),
    };
    mission.emergencyEvents = [...(mission.emergencyEvents ?? []), event].slice(
      -20,
    );
    const saved = await this.missions.save(mission);
    this.gateway.broadcastEmergency(saved.id, saved.teamCode, event);
    return {
      missionId: saved.id,
      reference: saved.reference,
      event,
      message:
        'Alerte transmise au superviseur avec les informations de mission.',
    };
  }

  toMaintenanceMission(
    mission: MissionEntity,
    incident: IncidentEntity | null,
    contact: UserEntity | null,
  ) {
    const point = incident?.location as {
      coordinates?: [number, number];
    } | null;
    const destination = point?.coordinates ?? [10.1855, 36.8375];
    const lastPosition = mission.lastPosition as {
      coordinates?: [number, number];
    } | null;
    const distanceKm = lastPosition?.coordinates
      ? this.distanceInKilometers(lastPosition.coordinates, destination)
      : null;
    const contractNumber =
      contact?.contractNumber ?? incident?.contractNumber ?? null;
    const initials = contact
      ? `${contact.firstName.slice(0, 1)}${contact.lastName.slice(0, 1)}`
      : 'CS';

    return {
      id: mission.id,
      reference: mission.reference,
      teamCode: mission.teamCode,
      incidentId: mission.incidentId,
      status: mission.status,
      etaMinutes: mission.etaMinutes,
      diagnosis: mission.diagnosis,
      estimatedRepairMinutes: mission.estimatedRepairMinutes,
      reportNotes: mission.reportNotes,
      photoUrls: mission.photoUrls ?? [],
      requestedResources: mission.requestedResources ?? [],
      statusHistory: mission.statusHistory ?? [],
      emergencyEvents: mission.emergencyEvents ?? [],
      lastPosition: mission.lastPosition,
      lastPositionAt: mission.lastPositionAt,
      acceptedAt: mission.acceptedAt,
      enRouteAt: mission.enRouteAt,
      onSiteAt: mission.onSiteAt,
      restoredAt: mission.restoredAt,
      closedAt: mission.closedAt,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      distanceKm:
        distanceKm === null ? null : Number(distanceKm.toFixed(1)),
      elapsedMinutes: Math.max(
        0,
        Math.round(
          ((mission.closedAt ?? new Date()).getTime() -
            mission.createdAt.getTime()) /
            60_000,
        ),
      ),
      incident: incident
        ? {
            id: incident.id,
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
          }
        : {
            id: mission.incidentId,
            reference: 'INC-02048',
            type: 'outage',
            description: 'Défaillance réseau confirmée par le centre.',
            address: '14, Rue des Orangers, El Menzah 6',
            severity: 'high',
            status: 'dispatched',
            photos: [],
            communityConfirmations: 23,
            location: {
              type: 'Point',
              coordinates: destination,
            },
            activity: [],
            createdAt: mission.createdAt,
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
          incident?.address ??
          'Adresse rattachée au dossier',
      },
    };
  }

  toHistoryItem(
    mission: MissionEntity,
    incident: IncidentEntity | null,
  ) {
    const completedAt = mission.closedAt ?? mission.updatedAt;
    return {
      id: mission.id,
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

  buildMaintenanceNotifications(
    mission: MissionEntity | null,
    incident: IncidentEntity | null,
  ) {
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
    const notifications = [
      {
        id: `mission-${mission.id}`,
        type: 'mission',
        title: `${mission.reference} — ${mission.status}`,
        body: incident
          ? `${incident.reference} · ${incident.address}`
          : 'Dossier technique synchronisé avec le centre.',
        createdAt: mission.updatedAt,
        unread: true,
      },
    ];
    if (!mission.diagnosis && mission.status === MissionStatus.DIAGNOSING) {
      notifications.push({
        id: `diagnosis-${mission.id}`,
        type: 'report',
        title: 'Diagnostic attendu',
        body: 'Complétez le rapport avant de démarrer la réparation.',
        createdAt: mission.updatedAt,
        unread: true,
      });
    }
    return notifications;
  }

  async reconcileClosedMissionTeams() {
    const teams = await this.teams.find({
      where: { status: FieldTeamStatus.ON_MISSION },
    });
    for (const team of teams) {
      if (!team.currentMissionId) continue;
      const mission = await this.missions.findOneBy({
        id: team.currentMissionId,
      });
      if (mission?.status !== MissionStatus.CLOSED) continue;
      team.status = FieldTeamStatus.AVAILABLE;
      team.currentMissionId = null;
      await this.teams.save(team);
    }
  }

  private distanceInKilometers(
    from: [number, number],
    to: [number, number],
  ) {
    const earthRadiusKm = 6371;
    const latitudeDelta = this.toRadians(to[1] - from[1]);
    const longitudeDelta = this.toRadians(to[0] - from[0]);
    const fromLatitude = this.toRadians(from[1]);
    const toLatitude = this.toRadians(to[1]);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(fromLatitude) *
        Math.cos(toLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }
}
