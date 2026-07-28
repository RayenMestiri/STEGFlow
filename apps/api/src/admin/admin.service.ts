import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthEventEntity, AuthEventType } from '../auth/auth-event.entity';
import { AuthenticatedUser } from '../auth/auth.types';
import { IncidentEntity, IncidentStatus } from '../incidents/incident.entity';
import { MissionEntity, MissionStatus } from '../missions/mission.entity';
import {
  NotificationChannel,
  NotificationsService,
} from '../notifications/notifications.service';
import { OutageEntity, OutageStatus } from '../outages/outage.entity';
import {
  AssignIncidentDto,
  SendNotificationDto,
  SettingValueDto,
  UpdateFieldTeamDto,
  UpdateIncidentDto,
  UpdateOutageStatusDto,
  UpdateSettingsDto,
} from './admin.dto';
import {
  AuditSeverity,
  FieldTeamEntity,
  FieldTeamStatus,
  NotificationCampaignEntity,
  NotificationCampaignStatus,
  OperationalAuditEntity,
  SystemSettingEntity,
} from './admin.entity';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    @InjectRepository(OutageEntity)
    private readonly outages: Repository<OutageEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(FieldTeamEntity)
    private readonly teams: Repository<FieldTeamEntity>,
    @InjectRepository(NotificationCampaignEntity)
    private readonly campaigns: Repository<NotificationCampaignEntity>,
    @InjectRepository(OperationalAuditEntity)
    private readonly audit: Repository<OperationalAuditEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly settings: Repository<SystemSettingEntity>,
    @InjectRepository(AuthEventEntity)
    private readonly authEvents: Repository<AuthEventEntity>,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.config.get('SEED_DEMO_DATA', 'true') !== 'true') return;
    await this.seedTeams();
    await this.seedSettings();
    await this.seedAudit();
  }

  async getDashboard() {
    const [outages, incidents, missions, teams, campaigns] = await Promise.all([
      this.outages.find(),
      this.incidents.find(),
      this.missions.find(),
      this.teams.find(),
      this.campaigns.find(),
    ]);
    const openIncidentStatuses = new Set([
      IncidentStatus.REPORTED,
      IncidentStatus.VERIFIED,
      IncidentStatus.DISPATCHED,
      IncidentStatus.IN_PROGRESS,
    ]);
    const activeMissionStatuses = new Set<MissionStatus>(
      Object.values(MissionStatus).filter((status) => status !== MissionStatus.CLOSED),
    );
    const recipients = campaigns.reduce((sum, campaign) => sum + campaign.recipients, 0);
    const delivered = campaigns.reduce((sum, campaign) => sum + campaign.delivered, 0);
    const failed = campaigns.reduce((sum, campaign) => sum + campaign.failed, 0);
    return {
      generatedAt: new Date().toISOString(),
      networkAvailability: 97.8,
      monthlyTarget: 98.5,
      outages: {
        total: outages.length,
        active: outages.filter((item) => item.status === OutageStatus.ACTIVE).length,
        scheduled: outages.filter((item) =>
          [OutageStatus.SCHEDULED, OutageStatus.NOTIFIED].includes(item.status),
        ).length,
        pendingApproval: outages.filter((item) => item.status === OutageStatus.PENDING_APPROVAL)
          .length,
        affectedCustomers: outages
          .filter((item) => ![OutageStatus.CLOSED, OutageStatus.RESTORED].includes(item.status))
          .reduce((sum, item) => sum + item.affectedCustomers, 0),
      },
      incidents: {
        total: incidents.length,
        open: incidents.filter((item) => openIncidentStatuses.has(item.status)).length,
        critical: incidents.filter(
          (item) => item.severity === 'critical' && openIncidentStatuses.has(item.status),
        ).length,
      },
      teams: {
        total: teams.length,
        available: teams.filter((item) => item.status === FieldTeamStatus.AVAILABLE).length,
        onMission: teams.filter((item) => item.status === FieldTeamStatus.ON_MISSION).length,
        connected: teams.filter((item) => item.status !== FieldTeamStatus.OFFLINE).length,
      },
      missions: {
        active: missions.filter((item) => activeMissionStatuses.has(item.status)).length,
      },
      notifications: {
        campaigns: campaigns.length,
        recipients,
        delivered,
        failed,
        deliveryRate: recipients ? Number(((delivered / recipients) * 100).toFixed(1)) : 100,
      },
    };
  }

  async getTeams() {
    const [teams, missions] = await Promise.all([
      this.teams.find({ order: { code: 'ASC' } }),
      this.missions.find({ order: { updatedAt: 'DESC' } }),
    ]);
    return teams.map((team) => ({
      ...team,
      currentMission:
        missions.find(
          (mission) =>
            mission.id === team.currentMissionId ||
            (mission.teamCode === team.code && mission.status !== MissionStatus.CLOSED),
        ) ?? null,
    }));
  }

  async updateTeam(id: string, dto: UpdateFieldTeamDto, actor: AuthenticatedUser) {
    const team = await this.teams.findOneBy({ id });
    if (!team) throw new NotFoundException('Équipe introuvable');
    team.status = dto.status;
    team.lastSeenAt = new Date();
    const saved = await this.teams.save(team);
    await this.record({
      action: 'team.status_changed',
      category: 'Équipes',
      title: `${team.code} — statut mis à jour`,
      details: `Nouveau statut : ${dto.status}`,
      severity: AuditSeverity.INFO,
      entityType: 'team',
      entityId: team.id,
      actor,
      metadata: { status: dto.status },
    });
    return saved;
  }

  async updateOutageStatus(
    id: string,
    dto: UpdateOutageStatusDto,
    actor: AuthenticatedUser,
  ) {
    const outage = await this.outages.findOneBy({ id });
    if (!outage) throw new NotFoundException('Coupure introuvable');
    const previous = outage.status;
    outage.status = dto.status;
    const saved = await this.outages.save(outage);
    await this.record({
      action: 'outage.status_changed',
      category: 'Coupures',
      title: `${outage.reference} — ${outage.zoneLabel}`,
      details: `${previous} → ${dto.status}`,
      severity:
        dto.status === OutageStatus.ACTIVE ? AuditSeverity.WARNING : AuditSeverity.SUCCESS,
      entityType: 'outage',
      entityId: outage.id,
      actor,
      metadata: { previous, current: dto.status },
    });
    return saved;
  }

  async updateIncident(id: string, dto: UpdateIncidentDto, actor: AuthenticatedUser) {
    const incident = await this.incidents.findOneBy({ id });
    if (!incident) throw new NotFoundException('Incident introuvable');
    if (dto.status) incident.status = dto.status;
    if (dto.severity) incident.severity = dto.severity;
    incident.activity = [
      ...(incident.activity ?? []),
      {
        at: new Date().toISOString(),
        label: dto.status
          ? `Statut modifié : ${dto.status}`
          : `Priorité modifiée : ${dto.severity}`,
        actor: `${actor.firstName} ${actor.lastName}`,
      },
    ];
    const saved = await this.incidents.save(incident);
    await this.record({
      action: 'incident.updated',
      category: 'Signalements',
      title: `${incident.reference} — dossier mis à jour`,
      details: dto.status ? `Statut : ${dto.status}` : `Priorité : ${dto.severity}`,
      severity:
        dto.severity === 'critical' ? AuditSeverity.CRITICAL : AuditSeverity.INFO,
      entityType: 'incident',
      entityId: incident.id,
      actor,
      metadata: { status: dto.status, severity: dto.severity },
    });
    return saved;
  }

  async assignIncident(id: string, dto: AssignIncidentDto, actor: AuthenticatedUser) {
    const [incident, team] = await Promise.all([
      this.incidents.findOneBy({ id }),
      this.teams.findOneBy({ id: dto.teamId }),
    ]);
    if (!incident) throw new NotFoundException('Incident introuvable');
    if (!team) throw new NotFoundException('Équipe introuvable');
    const sequence = (await this.missions.count()) + 1;
    const mission = await this.missions.save(
      this.missions.create({
        reference: `INT-${String(2048 + sequence).padStart(4, '0')}`,
        teamCode: team.code,
        incidentId: incident.id,
        status: MissionStatus.ASSIGNED,
        lastPosition: team.location,
        lastPositionAt: team.lastSeenAt,
        etaMinutes: 18,
        diagnosis: null,
        estimatedRepairMinutes: null,
        reportNotes: null,
        photoUrls: [],
        requestedResources: [],
        emergencyEvents: [],
        statusHistory: [
          {
            status: MissionStatus.ASSIGNED,
            at: new Date().toISOString(),
            source: `${actor.firstName} ${actor.lastName}`,
          },
        ],
        acceptedAt: null,
        enRouteAt: null,
        onSiteAt: null,
        restoredAt: null,
        closedAt: null,
      }),
    );
    incident.assignedTeamCode = team.code;
    incident.status = IncidentStatus.DISPATCHED;
    incident.activity = [
      ...(incident.activity ?? []),
      {
        at: new Date().toISOString(),
        label: `${team.code} affectée — mission ${mission.reference}`,
        actor: `${actor.firstName} ${actor.lastName}`,
      },
    ];
    team.status = FieldTeamStatus.ON_MISSION;
    team.currentMissionId = mission.id;
    await Promise.all([this.incidents.save(incident), this.teams.save(team)]);
    await this.record({
      action: 'incident.team_assigned',
      category: 'Dispatch',
      title: `${team.code} affectée à ${incident.reference}`,
      details: `Mission ${mission.reference} créée avec une arrivée estimée à 18 min.`,
      severity: AuditSeverity.SUCCESS,
      entityType: 'mission',
      entityId: mission.id,
      actor,
      metadata: { incidentId: incident.id, teamId: team.id },
    });
    return { incident, team, mission };
  }

  getNotificationCampaigns() {
    return this.campaigns.find({ order: { createdAt: 'DESC' } });
  }

  async sendNotification(dto: SendNotificationDto, actor: AuthenticatedUser) {
    const eventId = `manual-${Date.now()}`;
    const result = await this.notifications.enqueue({
      eventId,
      audience: { zoneId: dto.zoneId },
      audienceLabel: dto.audienceLabel,
      channels: dto.channels,
      title: dto.title,
      body: dto.body,
      recipients: dto.recipients,
      createdBy: `${actor.firstName} ${actor.lastName}`,
    });
    await this.record({
      action: 'notification.sent',
      category: 'Notifications',
      title: dto.title,
      details: `${dto.recipients} destinataires · ${dto.channels.join(', ')}`,
      severity: AuditSeverity.SUCCESS,
      entityType: 'notification',
      entityId: result.campaign.id,
      actor,
      metadata: { channels: dto.channels, recipients: dto.recipients },
    });
    return result.campaign;
  }

  async retryNotification(id: string, actor: AuthenticatedUser) {
    const campaign = await this.campaigns.findOneBy({ id });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    const retried = await this.notifications.enqueue({
      eventId: `retry-${campaign.id}-${Date.now()}`,
      audience: { zoneId: campaign.zoneId ?? undefined },
      audienceLabel: `Relance · ${campaign.audienceLabel}`,
      channels: campaign.channels as NotificationChannel[],
      title: campaign.title,
      body: campaign.body,
      recipients: Math.max(campaign.failed, 1),
      createdBy: `${actor.firstName} ${actor.lastName}`,
    });
    await this.record({
      action: 'notification.retried',
      category: 'Notifications',
      title: `Relance ${campaign.reference}`,
      details: `${Math.max(campaign.failed, 1)} destinataires remis en file.`,
      severity: AuditSeverity.INFO,
      entityType: 'notification',
      entityId: retried.campaign.id,
      actor,
      metadata: { sourceCampaignId: campaign.id },
    });
    return retried.campaign;
  }

  async getAudit() {
    const [operations, authEvents] = await Promise.all([
      this.audit.find({ order: { createdAt: 'DESC' }, take: 150 }),
      this.authEvents.find({ order: { createdAt: 'DESC' }, take: 80 }),
    ]);
    const authRows = authEvents.map((event) => ({
      id: event.id,
      action: event.type,
      category: 'Authentification',
      title: this.authEventTitle(event.type),
      details: event.reason ?? event.ipAddress ?? 'Accès sécurisé',
      severity:
        event.type === AuthEventType.LOGIN_FAILED || event.type === AuthEventType.ACCOUNT_LOCKED
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO,
      entityType: 'user',
      entityId: event.userId,
      actorEmail: event.email,
      actorName: event.email,
      metadata: { ipAddress: event.ipAddress },
      createdAt: event.createdAt,
    }));
    return [...operations, ...authRows]
      .sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt))
      .slice(0, 180);
  }

  getSettings() {
    return this.settings.find({ order: { group: 'ASC', label: 'ASC' } });
  }

  async updateSettings(dto: UpdateSettingsDto, actor: AuthenticatedUser) {
    const saved: SystemSettingEntity[] = [];
    for (const update of dto.settings) {
      const setting = await this.settings.findOneBy({ key: update.key });
      if (!setting) continue;
      setting.value = this.settingValue(update) as SystemSettingEntity['value'];
      setting.updatedBy = actor.email;
      saved.push(await this.settings.save(setting));
    }
    await this.record({
      action: 'settings.updated',
      category: 'Administration',
      title: 'Paramètres opérationnels mis à jour',
      details: `${saved.length} réglage(s) enregistré(s).`,
      severity: AuditSeverity.INFO,
      entityType: 'settings',
      entityId: null,
      actor,
      metadata: { keys: saved.map((setting) => setting.key) },
    });
    return saved;
  }

  private async seedTeams() {
    if ((await this.teams.count()) > 0) return;
    const currentMission = await this.missions.findOne({
      where: { status: MissionStatus.EN_ROUTE },
      order: { updatedAt: 'DESC' },
    });
    await this.teams.save([
      this.teams.create({
        code: 'Équipe 12',
        name: 'Intervention Nord',
        leadName: 'Mohamed Ben Salem',
        phone: '+216 71 000 812',
        vehicle: 'STEG-2412',
        status: FieldTeamStatus.ON_MISSION,
        members: 3,
        base: 'Centre Tunis Nord',
        skills: ['HTA/BT', 'Câbles souterrains', 'Urgence'],
        currentMissionId: currentMission?.id ?? null,
        location: currentMission?.lastPosition ?? {
          type: 'Point',
          coordinates: [10.1764, 36.8427],
        },
        lastSeenAt: new Date(),
      }),
      this.teams.create({
        code: 'Équipe 04',
        name: 'Maintenance Ariana',
        leadName: 'Nour Gharbi',
        phone: '+216 71 000 804',
        vehicle: 'STEG-2304',
        status: FieldTeamStatus.AVAILABLE,
        members: 2,
        base: 'Ariana',
        skills: ['Transformateurs', 'Basse tension'],
        currentMissionId: null,
        location: { type: 'Point', coordinates: [10.1882, 36.8665] },
        lastSeenAt: new Date(Date.now() - 2 * 60_000),
      }),
      this.teams.create({
        code: 'Équipe 08',
        name: 'Urgence Grand Tunis',
        leadName: 'Yassine Trabelsi',
        phone: '+216 71 000 808',
        vehicle: 'STEG-2308',
        status: FieldTeamStatus.AVAILABLE,
        members: 3,
        base: 'Ben Arous',
        skills: ['Incendie électrique', 'Lignes aériennes'],
        currentMissionId: null,
        location: { type: 'Point', coordinates: [10.2211, 36.7532] },
        lastSeenAt: new Date(Date.now() - 4 * 60_000),
      }),
      this.teams.create({
        code: 'Équipe 16',
        name: 'Renfort La Marsa',
        leadName: 'Alya Mansour',
        phone: '+216 71 000 816',
        vehicle: 'STEG-2316',
        status: FieldTeamStatus.RETURNING,
        members: 2,
        base: 'La Marsa',
        skills: ['Comptage', 'Branchements'],
        currentMissionId: null,
        location: { type: 'Point', coordinates: [10.3057, 36.8589] },
        lastSeenAt: new Date(Date.now() - 6 * 60_000),
      }),
    ]);
  }

  private async seedSettings() {
    if ((await this.settings.count()) > 0) return;
    await this.settings.save([
      this.settings.create({
        key: 'operations.refresh_seconds',
        group: 'Temps réel',
        label: 'Actualisation des positions',
        description: 'Intervalle de rafraîchissement des équipes actives.',
        value: 15,
        updatedBy: 'system',
      }),
      this.settings.create({
        key: 'operations.citizen_location_delay',
        group: 'Confidentialité',
        label: 'Délai de position citoyenne',
        description: 'Décalage appliqué à la position visible côté citoyen.',
        value: 60,
        updatedBy: 'system',
      }),
      this.settings.create({
        key: 'notifications.sms_fallback',
        group: 'Notifications',
        label: 'Basculement SMS automatique',
        description: 'Envoyer un SMS lorsqu’une notification push échoue.',
        value: true,
        updatedBy: 'system',
      }),
      this.settings.create({
        key: 'notifications.default_language',
        group: 'Notifications',
        label: 'Langue principale',
        description: 'Langue utilisée pour le premier message envoyé.',
        value: 'fr',
        updatedBy: 'system',
      }),
      this.settings.create({
        key: 'security.supervisor_approval',
        group: 'Sécurité',
        label: 'Validation superviseur',
        description: 'Exiger une validation avant toute publication planifiée.',
        value: true,
        updatedBy: 'system',
      }),
      this.settings.create({
        key: 'security.audit_retention_days',
        group: 'Sécurité',
        label: 'Conservation du journal',
        description: 'Durée de conservation des événements opérationnels.',
        value: 365,
        updatedBy: 'system',
      }),
    ]);
  }

  private async seedAudit() {
    if ((await this.audit.count()) > 0) return;
    const actor = {
      id: 'system',
      email: 'system@steg.tn',
      firstName: 'Système',
      lastName: 'STEGFlow',
      role: 'admin',
      contractNumber: null,
      address: null,
      teamCode: null,
      phone: null,
      governorate: null,
      delegation: null,
      district: null,
      latitude: null,
      longitude: null,
      lastLoginAt: null,
    } as AuthenticatedUser;
    await this.record({
      action: 'platform.started',
      category: 'Système',
      title: 'Centre des opérations initialisé',
      details: 'PostGIS, Redis, files de notifications et suivi temps réel disponibles.',
      severity: AuditSeverity.SUCCESS,
      entityType: 'system',
      entityId: null,
      actor,
      metadata: { version: '1.0.0' },
    });
  }

  private async record(entry: {
    action: string;
    category: string;
    title: string;
    details: string | null;
    severity: AuditSeverity;
    entityType: string | null;
    entityId: string | null;
    actor: AuthenticatedUser;
    metadata: Record<string, unknown>;
  }) {
    return this.audit.save(
      this.audit.create({
        action: entry.action,
        category: entry.category,
        title: entry.title,
        details: entry.details,
        severity: entry.severity,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorEmail: entry.actor.email,
        actorName: `${entry.actor.firstName} ${entry.actor.lastName}`,
        metadata: entry.metadata,
      }),
    );
  }

  private settingValue(setting: SettingValueDto) {
    if (setting.booleanValue !== undefined) return setting.booleanValue;
    if (setting.numberValue !== undefined) return setting.numberValue;
    if (setting.stringValue !== undefined) return setting.stringValue;
    return setting.objectValue ?? null;
  }

  private authEventTitle(type: AuthEventType) {
    return {
      [AuthEventType.LOGIN_SUCCESS]: 'Connexion réussie',
      [AuthEventType.LOGIN_FAILED]: 'Tentative de connexion refusée',
      [AuthEventType.ACCOUNT_LOCKED]: 'Compte temporairement verrouillé',
      [AuthEventType.REGISTER]: 'Compte citoyen créé',
      [AuthEventType.REFRESH_REUSE]: 'Réutilisation de session détectée',
      [AuthEventType.LOGOUT]: 'Déconnexion sécurisée',
    }[type];
  }
}
