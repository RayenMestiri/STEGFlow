import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { forkJoin } from 'rxjs';
import {
  AdminDashboard,
  AuditEntry,
  AuthService,
  FieldTeam,
  Incident,
  Login,
  Mission,
  NotificationCampaign,
  Outage,
  StegApiService,
  SystemSetting,
  addStegMarker,
  createStegMap,
  fitStegMap,
  supportsStegMap,
  whenStegMapReady,
  type StegCoordinates,
} from 'shared-data-access';

type NavKey =
  | 'overview'
  | 'outages'
  | 'incidents'
  | 'teams'
  | 'notifications'
  | 'audit'
  | 'settings';

type SettingValue = boolean | number | string | string[];

interface NavItem {
  key: NavKey;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, LucideAngularModule, Login],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(StegApiService);

  protected readonly activeNav = signal<NavKey>('overview');
  protected readonly sidebarOpen = signal(false);
  protected readonly createModalOpen = signal(false);
  protected readonly notificationModalOpen = signal(false);
  protected readonly outageStep = signal(1);
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Opération terminée');
  protected readonly operationError = signal('');
  protected readonly pageError = signal('');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly mapReady = signal(false);
  protected readonly operationalLayersVisible = signal(true);
  protected readonly globalQuery = signal('');

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly outages = signal<Outage[]>([]);
  protected readonly incidentRecords = signal<Incident[]>([]);
  protected readonly teams = signal<FieldTeam[]>([]);
  protected readonly campaigns = signal<NotificationCampaign[]>([]);
  protected readonly auditEntries = signal<AuditEntry[]>([]);
  protected readonly settings = signal<SystemSetting[]>([]);
  protected readonly operationsMissions = signal<Mission[]>([]);

  protected readonly outageFilter = signal('all');
  protected readonly incidentFilter = signal('all');
  protected readonly teamFilter = signal('all');
  protected readonly notificationFilter = signal('all');
  protected readonly auditFilter = signal('all');

  protected readonly selectedOutage = signal<Outage | null>(null);
  protected readonly selectedIncident = signal<Incident | null>(null);
  protected readonly selectedTeam = signal<FieldTeam | null>(null);
  protected readonly assignmentTeamId = signal('');

  protected readonly selectedZone = signal('El Menzah 6');
  protected readonly selectedFeeder = signal('Départ A3-07');
  protected readonly outageReason = signal('Maintenance préventive');
  protected readonly outageStart = signal('2026-07-28T16:30');
  protected readonly outageDuration = signal('90');
  protected readonly outagePriority = signal('normal');
  protected readonly approvalRequired = signal(true);
  protected readonly notifyPush = signal(true);
  protected readonly notifySms = signal(true);
  protected readonly notifyEmail = signal(false);

  protected readonly notificationTitle = signal('Information réseau STEG');
  protected readonly notificationBody = signal(
    'Une opération est en cours dans votre zone. Consultez STEGFlow pour suivre son évolution.',
  );
  protected readonly notificationAudience = signal('Clients de la zone A3 · El Menzah 6');
  protected readonly notificationZone = signal('zone-el-menzah-6-a3');
  protected readonly notificationRecipients = signal(1842);
  protected readonly notificationPush = signal(true);
  protected readonly notificationSms = signal(true);
  protected readonly notificationEmail = signal(false);

  protected readonly settingsDraft = signal<Record<string, SettingValue>>({});

  protected readonly pilotageItems: NavItem[] = [
    { key: 'overview', label: "Vue d'ensemble", icon: 'house' },
    { key: 'outages', label: 'Coupures', icon: 'zap-off' },
    { key: 'incidents', label: 'Signalements', icon: 'siren' },
    { key: 'teams', label: 'Équipes terrain', icon: 'users' },
    { key: 'notifications', label: 'Notifications', icon: 'bell' },
  ];

  protected readonly administrationItems: NavItem[] = [
    { key: 'audit', label: "Journal d'audit", icon: 'history' },
    { key: 'settings', label: 'Paramètres', icon: 'settings' },
  ];

  protected readonly allNavItems = [
    ...this.pilotageItems,
    ...this.administrationItems,
  ];

  protected readonly pageTitle = computed(
    () =>
      this.allNavItems.find((entry) => entry.key === this.activeNav())?.label ??
      "Vue d'ensemble",
  );

  protected readonly pageSubtitle = computed(
    () =>
      ({
        overview: 'Situation opérationnelle consolidée du Grand Tunis',
        outages: 'Planifier, valider et suivre le cycle de chaque interruption',
        incidents: 'Qualifier les alertes citoyennes et organiser la réponse terrain',
        teams: 'Disponibilités, compétences et missions en temps réel',
        notifications: 'Piloter les campagnes multicanales et leurs relances',
        audit: 'Traçabilité complète des accès et actions sensibles',
        settings: 'Règles opérationnelles, sécurité et confidentialité',
      })[this.activeNav()],
  );

  protected readonly filteredOutages = computed(() => {
    const query = this.normalizedQuery();
    return this.outages().filter(
      (outage) =>
        (this.outageFilter() === 'all' || outage.status === this.outageFilter()) &&
        (!query ||
          `${outage.reference} ${outage.zoneLabel} ${outage.reason} ${outage.status}`
            .toLowerCase()
            .includes(query)),
    );
  });

  protected readonly filteredIncidents = computed(() => {
    const query = this.normalizedQuery();
    return this.incidentRecords().filter(
      (incident) =>
        (this.incidentFilter() === 'all' || incident.severity === this.incidentFilter()) &&
        (!query ||
          `${incident.reference} ${this.incidentTypeLabel(incident.type)} ${incident.address} ${incident.status}`
            .toLowerCase()
            .includes(query)),
    );
  });

  protected readonly filteredTeams = computed(() => {
    const query = this.normalizedQuery();
    return this.teams().filter(
      (team) =>
        (this.teamFilter() === 'all' || team.status === this.teamFilter()) &&
        (!query ||
          `${team.code} ${team.name} ${team.leadName} ${team.vehicle} ${team.base}`
            .toLowerCase()
            .includes(query)),
    );
  });

  protected readonly filteredCampaigns = computed(() => {
    const query = this.normalizedQuery();
    return this.campaigns().filter(
      (campaign) =>
        (this.notificationFilter() === 'all' ||
          campaign.status === this.notificationFilter()) &&
        (!query ||
          `${campaign.reference} ${campaign.title} ${campaign.audienceLabel}`
            .toLowerCase()
            .includes(query)),
    );
  });

  protected readonly filteredAudit = computed(() => {
    const query = this.normalizedQuery();
    return this.auditEntries().filter(
      (entry) =>
        (this.auditFilter() === 'all' || entry.category === this.auditFilter()) &&
        (!query ||
          `${entry.title} ${entry.details ?? ''} ${entry.actorName} ${entry.category}`
            .toLowerCase()
            .includes(query)),
    );
  });

  protected readonly priorityIncidents = computed(() =>
    [...this.incidentRecords()]
      .filter((incident) => !['resolved', 'rejected'].includes(incident.status))
      .sort(
        (left, right) =>
          this.severityWeight(right.severity) - this.severityWeight(left.severity),
      )
      .slice(0, 3),
  );

  protected readonly auditCategories = computed(() =>
    [...new Set(this.auditEntries().map((entry) => entry.category))].sort(),
  );

  protected readonly settingsGroups = computed(() =>
    [...new Set(this.settings().map((setting) => setting.group))],
  );

  private operationsMap?: MapLibreMap;
  private mapElement?: HTMLDivElement;
  private readonly incidentMapMarkers: Marker[] = [];
  private readonly teamMapMarkers: Marker[] = [];
  private readonly outageMapMarkers: Marker[] = [];
  private operationsTimer?: number;
  private toastTimer?: number;
  @ViewChild('networkMapCanvas')
  set networkMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeOperationsMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.auth.initialize().subscribe({
      next: () => this.validateAccess(),
    });
  }

  ngOnDestroy(): void {
    if (this.operationsTimer) window.clearInterval(this.operationsTimer);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.operationsMap?.remove();
  }

  protected handleSignedIn(): void {
    this.validateAccess();
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }

  protected selectNav(key: NavKey): void {
    this.activeNav.set(key);
    this.sidebarOpen.set(false);
    this.selectedOutage.set(null);
    this.selectedIncident.set(null);
    this.selectedTeam.set(null);
    this.globalQuery.set('');
    if (key === 'overview') {
      window.setTimeout(() => this.operationsMap?.resize(), 0);
    }
  }

  protected refresh(): void {
    this.loadOperationsData(true);
  }

  protected navBadge(key: NavKey): number | null {
    const data = this.dashboard();
    if (!data) return null;
    if (key === 'outages') return data.outages.total;
    if (key === 'incidents') return data.incidents.open;
    if (key === 'teams') return data.teams.available;
    if (key === 'notifications') return data.notifications.failed;
    return null;
  }

  protected zoomOperationsMap(delta: number): void {
    if (!this.operationsMap) return;
    const currentZoom = this.operationsMap.getZoom();
    const targetZoom = Math.max(4, Math.min(18, currentZoom + delta));
    this.operationsMap.easeTo({
      zoom: targetZoom,
      duration: 300,
    });
  }

  protected centerOperationsMap(): void {
    const coordinates = [
      ...this.outageMapMarkers.map((marker) => {
        const point = marker.getLngLat();
        return [point.lng, point.lat] as StegCoordinates;
      }),
      ...this.teamMapMarkers.map((marker) => {
        const point = marker.getLngLat();
        return [point.lng, point.lat] as StegCoordinates;
      }),
      ...this.incidentMapMarkers.map((marker) => {
        const point = marker.getLngLat();
        return [point.lng, point.lat] as StegCoordinates;
      }),
    ];
    if (this.operationsMap) {
      if (coordinates.length) {
        fitStegMap(this.operationsMap, coordinates, 64);
      } else {
        this.operationsMap.flyTo({ center: [10.1815, 36.826], zoom: 11.5, duration: 400 });
      }
    }
  }

  protected toggleOperationalLayers(): void {
    this.operationalLayersVisible.update((visible) => !visible);
    const display = this.operationalLayersVisible() ? '' : 'none';
    [...this.incidentMapMarkers, ...this.teamMapMarkers].forEach(
      (marker) => (marker.getElement().style.display = display),
    );
    this.showToast(
      'Carte actualisée',
      this.operationalLayersVisible()
        ? 'Les incidents et les équipes sont visibles.'
        : 'Les couches opérationnelles sont masquées.',
    );
  }

  protected openCreateOutage(): void {
    this.outageStep.set(1);
    this.operationError.set('');
    this.createModalOpen.set(true);
  }

  protected closeCreateOutage(): void {
    this.createModalOpen.set(false);
  }

  protected nextOutageStep(): void {
    this.outageStep.update((step) => Math.min(step + 1, 5));
  }

  protected previousOutageStep(): void {
    this.outageStep.update((step) => Math.max(step - 1, 1));
  }

  protected createOutage(): void {
    this.saving.set(true);
    this.operationError.set('');
    const zoneId = `zone-${this.selectedZone()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')}`;
    this.api
      .createOutage({
        zoneId,
        zoneLabel: this.selectedZone(),
        reason: this.outageReason(),
        startsAt: new Date(this.outageStart()).toISOString(),
        durationMinutes: Number(this.outageDuration()),
        supervisorApprovalRequired: this.approvalRequired(),
      })
      .subscribe({
        next: (outage) => {
          if (this.approvalRequired()) {
            this.finishOutageCreation(outage, false);
            return;
          }
          this.api.publishOutage(outage.id).subscribe({
            next: () => this.finishOutageCreation(outage, true),
            error: () => this.saveFailed(),
          });
        },
        error: () => this.saveFailed(),
      });
  }

  protected updateOutageStatus(outage: Outage, status: string): void {
    this.saving.set(true);
    this.api.updateOutageStatus(outage.id, status).subscribe({
      next: (updated) => {
        this.replaceOutage(updated);
        this.selectedOutage.set(updated);
        this.saving.set(false);
        this.showToast('Coupure mise à jour', `${updated.reference} est maintenant « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => this.actionFailed('Impossible de modifier le statut de cette coupure.'),
    });
  }

  protected publishExistingOutage(outage: Outage): void {
    this.saving.set(true);
    this.api.publishOutage(outage.id).subscribe({
      next: (updated) => {
        this.replaceOutage(updated);
        this.selectedOutage.set(updated);
        this.saving.set(false);
        this.showToast(
          'Coupure publiée',
          `${updated.reference} est publiée et les notifications sont en file.`,
        );
        this.loadDashboard();
        this.loadNotifications();
      },
      error: () => this.actionFailed('La publication et la notification ont échoué.'),
    });
  }

  protected updateIncidentStatus(incident: Incident, status: string): void {
    this.saving.set(true);
    this.api.updateIncident(incident.id, { status }).subscribe({
      next: (updated) => {
        this.replaceIncident(updated);
        this.selectedIncident.set(updated);
        this.saving.set(false);
        this.showToast('Signalement mis à jour', `${updated.reference} est maintenant « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => this.actionFailed('Impossible de modifier ce signalement.'),
    });
  }

  protected assignSelectedIncident(): void {
    const incident = this.selectedIncident();
    const teamId = this.assignmentTeamId();
    if (!incident || !teamId) return;
    this.saving.set(true);
    this.api.assignIncident(incident.id, teamId).subscribe({
      next: ({ incident: updatedIncident, mission }) => {
        this.replaceIncident(updatedIncident);
        this.selectedIncident.set(updatedIncident);
        this.assignmentTeamId.set('');
        this.saving.set(false);
        this.showToast(
          'Équipe affectée',
          `${mission.teamCode} a reçu la mission ${mission.reference}.`,
        );
        this.loadTeams();
        this.loadDashboard();
      },
      error: () => this.actionFailed("L'affectation de l'équipe a échoué."),
    });
  }

  protected updateTeamStatus(team: FieldTeam, status: FieldTeam['status']): void {
    this.saving.set(true);
    this.api.updateTeamStatus(team.id, status).subscribe({
      next: (updated) => {
        this.teams.update((items) =>
          items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        );
        this.selectedTeam.set({ ...team, ...updated });
        this.saving.set(false);
        this.showToast('Disponibilité actualisée', `${updated.code} est « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => this.actionFailed("Le statut de l'équipe n'a pas pu être enregistré."),
    });
  }

  protected openNotificationComposer(): void {
    this.operationError.set('');
    this.notificationModalOpen.set(true);
  }

  protected sendNotification(): void {
    const channels: Array<'push' | 'sms' | 'email'> = [];
    if (this.notificationPush()) channels.push('push');
    if (this.notificationSms()) channels.push('sms');
    if (this.notificationEmail()) channels.push('email');
    if (!channels.length) {
      this.operationError.set('Sélectionnez au moins un canal.');
      return;
    }
    this.saving.set(true);
    this.operationError.set('');
    this.api
      .sendNotification({
        title: this.notificationTitle(),
        body: this.notificationBody(),
        audienceLabel: this.notificationAudience(),
        zoneId: this.notificationZone() || undefined,
        channels,
        recipients: Number(this.notificationRecipients()),
      })
      .subscribe({
        next: (campaign) => {
          this.campaigns.update((items) => [campaign, ...items]);
          this.notificationModalOpen.set(false);
          this.saving.set(false);
          this.showToast(
            'Campagne placée en file',
            `${campaign.reference} cible ${campaign.recipients.toLocaleString('fr-FR')} destinataires.`,
          );
          window.setTimeout(() => this.loadNotifications(), 800);
        },
        error: () => this.actionFailed("La campagne n'a pas pu être envoyée."),
      });
  }

  protected retryNotification(campaign: NotificationCampaign): void {
    this.saving.set(true);
    this.api.retryNotification(campaign.id).subscribe({
      next: (retried) => {
        this.campaigns.update((items) => [retried, ...items]);
        this.saving.set(false);
        this.showToast(
          'Relance programmée',
          `${Math.max(campaign.failed, 1)} message(s) sont remis en file.`,
        );
        window.setTimeout(() => this.loadNotifications(), 800);
      },
      error: () => this.actionFailed('La relance a échoué.'),
    });
  }

  protected settingValue(key: string): SettingValue {
    return this.settingsDraft()[key] ?? '';
  }

  protected isBooleanSetting(setting: SystemSetting): boolean {
    return typeof setting.value === 'boolean';
  }

  protected isNumberSetting(setting: SystemSetting): boolean {
    return typeof setting.value === 'number';
  }

  protected setSettingValue(key: string, value: SettingValue): void {
    this.settingsDraft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected saveSettings(): void {
    const updates = this.settings().map((setting) => {
      const value = this.settingsDraft()[setting.key];
      return {
        key: setting.key,
        ...(typeof value === 'boolean'
          ? { booleanValue: value }
          : typeof value === 'number'
            ? { numberValue: value }
            : { stringValue: String(value ?? '') }),
      };
    });
    this.saving.set(true);
    this.api.updateSystemSettings(updates).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.initializeSettingsDraft(settings);
        this.saving.set(false);
        this.showToast(
          'Paramètres enregistrés',
          `${settings.length} règle(s) opérationnelle(s) mises à jour.`,
        );
        this.loadAudit();
      },
      error: () => this.actionFailed("Les paramètres n'ont pas pu être enregistrés."),
    });
  }

  protected exportAudit(): void {
    const header = ['Date', 'Catégorie', 'Action', 'Acteur', 'Détails'];
    const rows = this.filteredAudit().map((entry) => [
      new Date(entry.createdAt).toLocaleString('fr-TN'),
      entry.category,
      entry.title,
      entry.actorName,
      entry.details ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stegflow-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showToast('Export prêt', `${rows.length} événement(s) exportés au format CSV.`);
  }

  protected statusLabel(status: string): string {
    return (
      {
        draft: 'Brouillon',
        pending_approval: 'À valider',
        scheduled: 'Programmée',
        notified: 'Notifiée',
        active: 'En cours',
        restored: 'Rétablie',
        closed: 'Clôturée',
        reported: 'Reçu',
        verified: 'Vérifié',
        dispatched: 'Équipe affectée',
        in_progress: 'Traitement en cours',
        resolved: 'Résolu',
        rejected: 'Rejeté',
        available: 'Disponible',
        on_mission: 'En mission',
        returning: 'Retour base',
        offline: 'Hors ligne',
        queued: 'En file',
        sending: 'Envoi en cours',
        delivered: 'Livrée',
        partial: 'Livraison partielle',
        failed: 'Échec',
        assigned: 'Affectée',
        accepted: 'Acceptée',
        en_route: 'En déplacement',
        on_site: 'Sur place',
        diagnosing: 'Diagnostic',
        repairing: 'Réparation',
        testing: 'Tests',
      }[status] ?? status
    );
  }

  protected statusTone(status: string): string {
    if (
      ['active', 'critical', 'failed', 'rejected', 'offline'].includes(status)
    ) return 'danger';
    if (
      ['pending_approval', 'reported', 'high', 'partial', 'returning', 'queued'].includes(status)
    ) return 'warning';
    if (
      ['scheduled', 'notified', 'verified', 'dispatched', 'on_mission', 'sending', 'en_route'].includes(
        status,
      )
    ) return 'info';
    if (['restored', 'closed', 'resolved', 'available', 'delivered'].includes(status))
      return 'success';
    return 'neutral';
  }

  protected incidentTypeLabel(type: string): string {
    return (
      {
        outage: 'Coupure non déclarée',
        voltage: 'Tension faible ou instable',
        fire: 'Incendie ou étincelles',
        wire: 'Câble électrique dangereux',
        meter: 'Compteur endommagé',
        other: 'Autre anomalie',
      }[type] ?? type
    );
  }

  protected formatDate(value?: string | null, includeTime = true): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      day: '2-digit',
      month: 'short',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected formatTime(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected relativeTime(value?: string | null): string {
    if (!value) return 'Jamais';
    const minutes = Math.max(0, Math.round((Date.now() - +new Date(value)) / 60_000));
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours} h`;
    return this.formatDate(value, false);
  }

  protected completionRate(campaign: NotificationCampaign): number {
    if (!campaign.recipients) return 0;
    return Math.round((campaign.delivered / campaign.recipients) * 100);
  }

  protected availableTeams(): FieldTeam[] {
    return this.teams().filter((team) => team.status === 'available');
  }

  private validateAccess(): void {
    if (!this.auth.isAuthenticated()) return;
    this.auth.requireRole(['admin', 'supervisor', 'dispatcher']).subscribe({
      next: () => {
        this.loadOperationsData();
        this.startOperationsTracking();
      },
      error: (error) => this.operationError.set(error.message),
    });
  }

  private loadOperationsData(showToast = false): void {
    this.loading.set(true);
    this.pageError.set('');
    forkJoin({
      dashboard: this.api.getAdminDashboard(),
      outages: this.api.getOutages(),
      incidents: this.api.getIncidents(),
      teams: this.api.getTeams(),
      campaigns: this.api.getNotificationCampaigns(),
      audit: this.api.getAuditLog(),
      settings: this.api.getSystemSettings(),
      missions: this.api.getOperationsTracking(),
    }).subscribe({
      next: (result) => {
        this.dashboard.set(result.dashboard);
        this.outages.set(result.outages);
        this.incidentRecords.set(result.incidents);
        this.teams.set(result.teams);
        this.campaigns.set(result.campaigns);
        this.auditEntries.set(result.audit);
        this.settings.set(result.settings);
        this.operationsMissions.set(result.missions);
        this.initializeSettingsDraft(result.settings);
        this.loading.set(false);
        void this.renderTeams(result.missions);
        void this.renderIncidents(result.incidents);
        if (showToast) this.showToast('Données actualisées', 'Le centre des opérations est synchronisé.');
      },
      error: () => {
        this.loading.set(false);
        this.pageError.set(
          "Le centre des opérations n'a pas pu charger toutes les données. Réessayez.",
        );
      },
    });
  }

  private loadDashboard(): void {
    this.api.getAdminDashboard().subscribe((dashboard) => this.dashboard.set(dashboard));
  }

  private loadTeams(): void {
    this.api.getTeams().subscribe((teams) => this.teams.set(teams));
  }

  private loadNotifications(): void {
    this.api
      .getNotificationCampaigns()
      .subscribe((campaigns) => this.campaigns.set(campaigns));
  }

  private loadAudit(): void {
    this.api.getAuditLog().subscribe((entries) => this.auditEntries.set(entries));
  }

  private async initializeOperationsMap(element: HTMLDivElement): Promise<void> {
    if (this.operationsMap && this.mapElement === element) {
      this.operationsMap.resize();
      return;
    }
    if (!supportsStegMap()) {
      this.pageError.set(
        'La carte nécessite WebGL. Les autres fonctions du centre restent disponibles.',
      );
      return;
    }
    this.operationsMap?.remove();
    this.mapElement = element;
    this.mapReady.set(false);
    this.operationsMap = await createStegMap(element, [10.1815, 36.8065], 10.8);
    whenStegMapReady(this.operationsMap, () => {
      this.mapReady.set(true);
      this.operationsMap?.resize();
      this.centerOperationsMap();
    });
    await this.renderOutages(this.outages());
    await this.renderTeams(this.operationsMissions());
    await this.renderIncidents(this.incidentRecords());
  }

  private startOperationsTracking(): void {
    if (!this.auth.isAuthenticated()) return;
    const refresh = () => {
      this.api.getOperationsTracking().subscribe({
        next: (missions) => {
          this.operationsMissions.set(missions);
          void this.renderTeams(missions);
        },
      });
      this.api.getIncidents().subscribe({
        next: (incidents) => {
          this.incidentRecords.set(incidents);
          void this.renderIncidents(incidents);
        },
      });
    };
    if (this.operationsTimer) window.clearInterval(this.operationsTimer);
    this.operationsTimer = window.setInterval(refresh, 15_000);
  }

  private async renderOutages(outages: Outage[]): Promise<void> {
    if (!this.operationsMap) return;
    this.outageMapMarkers.splice(0).forEach((marker) => marker.remove());
    for (const outage of outages) {
      if (outage.longitude == null || outage.latitude == null) continue;
      const coords: StegCoordinates = [
        outage.longitude,
        outage.latitude,
      ];
      this.outageMapMarkers.push(
        await addStegMarker(this.operationsMap, coords, {
          tone: 'outage',
          label: `${outage.reference} · ${outage.zoneLabel}`,
          detail: `${outage.affectedCustomers ?? 0} clients concernés · ${outage.reason}`,
          showLabel: outages.length <= 4,
        }),
      );
    }
    if (this.mapReady()) this.centerOperationsMap();
  }

  private async renderTeams(missions: Mission[]): Promise<void> {
    if (!this.operationsMap) return;
    this.teamMapMarkers.splice(0).forEach((marker) => marker.remove());
    
    const teamPositions = new Map<string, { coords: StegCoordinates; detail: string }>();

    // Collect positions from active missions
    for (const mission of missions) {
      const coords = this.extractCoords(mission.lastPosition);
      if (coords) {
        teamPositions.set(mission.teamCode, {
          coords,
          detail: `${mission.reference} · ${mission.etaMinutes ?? '—'} min`,
        });
      }
    }

    // Collect positions from team directory
    for (const team of this.teams()) {
      if (!teamPositions.has(team.code)) {
        const coords = this.extractCoords(team.location);
        if (coords) {
          teamPositions.set(team.code, {
            coords,
            detail: `Équipe ${team.code} · ${team.status === 'on_mission' ? 'En intervention' : 'Disponible'}`,
          });
        }
      }
    }

    for (const [code, info] of teamPositions.entries()) {
      this.teamMapMarkers.push(
        await addStegMarker(this.operationsMap, info.coords, {
          tone: 'team',
          label: code,
          detail: info.detail,
          showLabel: true,
        }),
      );
    }
    if (this.mapReady()) this.centerOperationsMap();
  }

  private async renderIncidents(incidents: Incident[]): Promise<void> {
    if (!this.operationsMap) return;
    this.incidentMapMarkers.splice(0).forEach((marker) => marker.remove());
    
    const list = incidents.length ? incidents : this.incidentRecords();
    
    for (const incident of list) {
      const coords = this.extractCoords(incident.location);
      if (!coords) continue;
      this.incidentMapMarkers.push(
        await addStegMarker(this.operationsMap, coords, {
          tone: incident.severity === 'critical' ? 'incident' : 'outage',
          label: `${incident.reference} · ${this.incidentTypeLabel(incident.type)}`,
          detail: `${incident.address} (Priorité ${incident.severity})`,
          showLabel: true,
        }),
      );
    }
    if (this.mapReady()) this.centerOperationsMap();
  }

  private extractCoords(raw: any): StegCoordinates | null {
    if (!raw) return null;
    if (Array.isArray(raw) && raw.length >= 2) {
      const [lng, lat] = raw.map(Number);
      if (!isNaN(lng) && !isNaN(lat)) return [lng, lat];
    }
    if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
      const [lng, lat] = raw.coordinates.map(Number);
      if (!isNaN(lng) && !isNaN(lat)) return [lng, lat];
    }
    if (typeof raw.longitude === 'number' && typeof raw.latitude === 'number') {
      return [raw.longitude, raw.latitude];
    }
    if (typeof raw.lng === 'number' && typeof raw.lat === 'number') {
      return [raw.lng, raw.lat];
    }
    return null;
  }

  private initializeSettingsDraft(settings: SystemSetting[]): void {
    this.settingsDraft.set(
      Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    );
  }

  private finishOutageCreation(outage: Outage, published: boolean): void {
    this.saving.set(false);
    this.createModalOpen.set(false);
    this.outages.update((items) => [outage, ...items]);
    this.showToast(
      published ? 'Coupure publiée' : 'Validation demandée',
      published
        ? `${outage.reference} a été publiée et la notification est en file.`
        : `${outage.reference} attend la validation du superviseur.`,
    );
    this.loadOperationsData();
  }

  private replaceOutage(updated: Outage): void {
    this.outages.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  private replaceIncident(updated: Incident): void {
    this.incidentRecords.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  private saveFailed(): void {
    this.saving.set(false);
    this.operationError.set(
      'La création a échoué. Vérifiez les informations et la connexion au service STEG.',
    );
  }

  private actionFailed(message: string): void {
    this.saving.set(false);
    this.operationError.set(message);
    this.showToast('Action non enregistrée', message);
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4200);
  }

  private normalizedQuery(): string {
    return this.globalQuery().trim().toLowerCase();
  }

  private severityWeight(severity: string): number {
    return { critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 0;
  }
}
