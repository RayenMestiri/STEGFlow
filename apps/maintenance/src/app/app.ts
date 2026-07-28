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
import { SwUpdate } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { forkJoin, Subscription, switchMap } from 'rxjs';
import {
  AuthService,
  Login,
  MaintenanceDashboard,
  MaintenanceHistoryItem,
  MaintenanceMission,
  StegApiService,
  UpdateMaintenanceReport,
  addStegMarker,
  createStegMap,
  drawStegRoute,
  fitStegMap,
  supportsStegMap,
  type StegCoordinates,
} from 'shared-data-access';

type MaintenanceView = 'mission' | 'report' | 'history' | 'profile';
type EmergencyType = 'accident' | 'electrical' | 'security';

interface MissionStatus {
  value: string;
  label: string;
  short: string;
  action: string;
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
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  protected readonly activeView = signal<MaintenanceView>('mission');
  protected readonly dashboard = signal<MaintenanceDashboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly syncing = signal(false);
  protected readonly gpsSyncing = signal(false);
  protected readonly online = signal(navigator.onLine);
  protected readonly gpsActive = signal(false);
  protected readonly notificationsOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly sosOpen = signal(false);
  protected readonly emergencySending = signal(false);
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Mise à jour synchronisée');
  protected readonly mapReady = signal(false);
  protected readonly now = signal(Date.now());

  protected readonly diagnosis = signal('');
  protected readonly estimate = signal('45');
  protected readonly note = signal('');
  protected readonly requestedResources = signal<string[]>([]);
  protected readonly reportSaving = signal(false);
  protected readonly photoUploading = signal(false);
  protected readonly historySearch = signal('');
  protected readonly selectedHistory = signal<MaintenanceHistoryItem | null>(
    null,
  );
  protected readonly emergencyNote = signal('');
  protected readonly safetyChecks = signal<Record<string, boolean>>({
    ppe: true,
    voltage: false,
    perimeter: false,
    tools: true,
  });

  protected readonly statuses: MissionStatus[] = [
    {
      value: 'assigned',
      label: 'Mission affectée',
      short: 'Affectée',
      action: 'Accepter la mission',
      icon: 'clipboard-check',
    },
    {
      value: 'accepted',
      label: 'Mission acceptée',
      short: 'Acceptée',
      action: 'Démarrer le trajet',
      icon: 'check',
    },
    {
      value: 'en_route',
      label: 'En déplacement',
      short: 'En route',
      action: 'Confirmer mon arrivée',
      icon: 'navigation',
    },
    {
      value: 'on_site',
      label: 'Arrivée sur place',
      short: 'Sur place',
      action: 'Démarrer le diagnostic',
      icon: 'map-pin-check',
    },
    {
      value: 'diagnosing',
      label: 'Diagnostic en cours',
      short: 'Diagnostic',
      action: 'Démarrer la réparation',
      icon: 'scan-search',
    },
    {
      value: 'repairing',
      label: 'Réparation en cours',
      short: 'Réparation',
      action: 'Passer aux tests',
      icon: 'wrench',
    },
    {
      value: 'testing',
      label: 'Tests de remise en service',
      short: 'Tests',
      action: 'Confirmer le rétablissement',
      icon: 'activity',
    },
    {
      value: 'restored',
      label: 'Courant rétabli',
      short: 'Rétabli',
      action: 'Clôturer la mission',
      icon: 'zap',
    },
    {
      value: 'closed',
      label: 'Intervention clôturée',
      short: 'Clôturée',
      action: 'Mission terminée',
      icon: 'badge-check',
    },
  ];

  protected readonly resourceOptions = [
    'Renfort humain',
    'Nacelle',
    'Câble BT',
    'Câble MT',
    'Fusibles',
    'Transformateur',
    'Groupe électrogène',
    'Balisage renforcé',
  ];

  protected readonly mission = computed(
    () => this.dashboard()?.activeMission ?? null,
  );
  protected readonly team = computed(() => this.dashboard()?.team ?? null);
  protected readonly statusIndex = computed(() => {
    const mission = this.mission();
    if (!mission) return -1;
    return this.statuses.findIndex((status) => status.value === mission.status);
  });
  protected readonly currentStatus = computed(
    () =>
      this.statuses[Math.max(this.statusIndex(), 0)] ?? this.statuses[0],
  );
  protected readonly progress = computed(() =>
    this.statusIndex() < 0
      ? 0
      : ((this.statusIndex() + 1) / this.statuses.length) * 100,
  );
  protected readonly unreadNotifications = computed(
    () =>
      this.dashboard()?.notifications.filter((notification) => notification.unread)
        .length ?? 0,
  );
  protected readonly filteredHistory = computed(() => {
    const query = this.normalize(this.historySearch());
    const history = this.dashboard()?.history ?? [];
    if (!query) return history;
    return history.filter((item) =>
      this.normalize(
        `${item.reference} ${item.incidentReference} ${item.address} ${item.diagnosis ?? ''}`,
      ).includes(query),
    );
  });
  protected readonly reportCompleteness = computed(() => {
    const mission = this.mission();
    if (!mission) return 0;
    const completed = [
      Boolean(this.diagnosis().trim()),
      Boolean(Number(this.estimate())),
      Boolean(this.note().trim()),
      mission.photoUrls.length > 0,
      this.requestedResources().length > 0,
    ].filter(Boolean).length;
    return completed * 20;
  });
  protected readonly safetyCompleted = computed(
    () => Object.values(this.safetyChecks()).filter(Boolean).length,
  );

  private fieldMap?: MapLibreMap;
  private mapElement?: HTMLDivElement;
  private teamMapMarker?: Marker;
  private destinationMapMarker?: Marker;
  private gpsWatchId?: number;
  private gpsLastSentAt = 0;
  private clockTimer?: number;
  private pollTimer?: number;
  private toastTimer?: number;
  private loadedMissionId?: string;
  private updateSubscription?: Subscription;

  @ViewChild('fieldMapCanvas')
  set fieldMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeFieldMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.initializeAppUpdates();
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.clockTimer = window.setInterval(() => this.now.set(Date.now()), 1000);
    this.auth.initialize().subscribe({ next: () => this.handleSignedIn() });
  }

  ngOnDestroy(): void {
    this.stopGps();
    if (this.clockTimer) window.clearInterval(this.clockTimer);
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.updateSubscription?.unsubscribe();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.fieldMap?.remove();
  }

  protected handleSignedIn(): void {
    if (!this.auth.isAuthenticated()) return;
    this.operationError.set('');
    this.auth
      .requireRole(['admin', 'supervisor', 'technician'])
      .subscribe({
        next: () => {
          this.loadDashboard();
          if (this.pollTimer) window.clearInterval(this.pollTimer);
          this.pollTimer = window.setInterval(() => {
            if (this.online() && !this.syncing() && !this.reportSaving()) {
              this.loadDashboard(false, true);
            }
          }, 20_000);
        },
        error: (error) => this.operationError.set(error.message),
      });
  }

  protected logout(): void {
    this.stopGps();
    this.notificationsOpen.set(false);
    this.profileMenuOpen.set(false);
    this.auth.logout().subscribe();
  }

  protected selectView(view: MaintenanceView): void {
    this.activeView.set(view);
    this.notificationsOpen.set(false);
    this.profileMenuOpen.set(false);
    this.operationError.set('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => {
      if (view === 'mission') {
        this.fieldMap?.resize();
        void this.renderMissionOnMap();
      }
    }, 0);
  }

  protected refresh(): void {
    this.loadDashboard(true);
  }

  protected advanceMission(): void {
    const mission = this.mission();
    const currentIndex = this.statusIndex();
    if (
      !mission ||
      currentIndex < 0 ||
      currentIndex >= this.statuses.length - 1 ||
      this.syncing()
    ) {
      return;
    }
    const nextStatus = this.statuses[currentIndex + 1];
    if (nextStatus.value === 'repairing' && !this.diagnosis().trim()) {
      this.activeView.set('report');
      this.operationError.set(
        'Ajoutez la cause constatée avant de démarrer la réparation.',
      );
      return;
    }

    this.syncing.set(true);
    this.operationError.set('');
    const statusUpdate = () =>
      this.api.updateMissionStatus(
        mission.id,
        nextStatus.value,
        this.diagnosis().trim() || undefined,
      );
    const request =
      nextStatus.value === 'repairing'
        ? this.api
            .updateMissionReport(mission.id, this.reportPayload())
            .pipe(switchMap(() => statusUpdate()))
        : statusUpdate();

    request.subscribe({
      next: () => {
        this.syncing.set(false);
        if (nextStatus.value === 'closed') this.stopGps();
        this.showToast(
          'Étape validée',
          `${nextStatus.label}. Le centre et les citoyens concernés ont été informés.`,
        );
        this.loadDashboard(false, true);
      },
      error: () => {
        this.syncing.set(false);
        this.operationError.set(
          'La mise à jour n’a pas pu être synchronisée. Réessayez lorsque le réseau est disponible.',
        );
      },
    });
  }

  protected toggleGps(): void {
    if (this.gpsActive()) {
      this.stopGps();
      this.showToast(
        'Partage GPS suspendu',
        'Le superviseur ne reçoit plus votre position.',
      );
      return;
    }
    if (!this.online()) {
      this.operationError.set(
        'Le partage GPS nécessite une connexion réseau active.',
      );
      return;
    }
    const mission = this.mission();
    if (!mission || !navigator.geolocation) {
      this.operationError.set(
        'La géolocalisation n’est pas disponible sur cet appareil.',
      );
      return;
    }
    this.operationError.set('');
    this.gpsWatchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - this.gpsLastSentAt < 15_000) return;
        this.gpsLastSentAt = now;
        this.transmitPosition(coords.latitude, coords.longitude);
      },
      () => {
        this.stopGps();
        this.operationError.set(
          'Position non transmise. Autorisez le GPS puis réessayez.',
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8_000,
        timeout: 15_000,
      },
    );
    this.gpsActive.set(true);
    this.showToast(
      'Partage GPS activé',
      'Une position sécurisée sera transmise toutes les 15 secondes pendant la mission.',
    );
  }

  protected saveReport(): void {
    const mission = this.mission();
    if (!mission || this.reportSaving()) return;
    this.reportSaving.set(true);
    this.operationError.set('');
    this.api.updateMissionReport(mission.id, this.reportPayload()).subscribe({
      next: () => {
        this.reportSaving.set(false);
        localStorage.removeItem(this.reportDraftKey(mission.id));
        this.showToast(
          'Rapport enregistré',
          'Le diagnostic, l’estimation et les besoins sont visibles par le centre.',
        );
        this.loadDashboard(false, true);
      },
      error: () => {
        this.reportSaving.set(false);
        this.persistReportDraft();
        this.operationError.set(
          'Rapport conservé sur cet appareil. La synchronisation sera relancée avec le réseau.',
        );
      },
    });
  }

  protected persistReportDraft(): void {
    const mission = this.mission();
    if (!mission) return;
    localStorage.setItem(
      this.reportDraftKey(mission.id),
      JSON.stringify({
        diagnosis: this.diagnosis(),
        estimate: this.estimate(),
        note: this.note(),
        requestedResources: this.requestedResources(),
      }),
    );
  }

  protected toggleResource(resource: string): void {
    this.requestedResources.update((resources) =>
      resources.includes(resource)
        ? resources.filter((item) => item !== resource)
        : [...resources, resource],
    );
    this.persistReportDraft();
  }

  protected onMissionPhotoSelected(event: Event): void {
    const mission = this.mission();
    const currentCount = mission?.photoUrls.length ?? 0;
    const files = Array.from(
      (event.target as HTMLInputElement).files ?? [],
    ).slice(0, 12 - currentCount);
    if (!mission || !files.length || this.photoUploading()) return;
    this.photoUploading.set(true);
    this.operationError.set('');
    forkJoin(files.map((file) => this.api.uploadPhoto(file)))
      .pipe(
        switchMap((uploads) =>
          this.api.addMissionPhotos(
            mission.id,
            uploads.map((upload) => upload.url),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.photoUploading.set(false);
          this.showToast(
            'Preuves terrain sécurisées',
            `${files.length} photo(s) rattachée(s) à ${mission.reference}.`,
          );
          this.loadDashboard(false, true);
        },
        error: () => {
          this.photoUploading.set(false);
          this.operationError.set(
            'Une preuve photo n’a pas pu être stockée. Réessayez sans vous exposer au danger.',
          );
        },
      });
  }

  protected sendEmergency(type: EmergencyType): void {
    const mission = this.mission();
    if (!mission || this.emergencySending()) return;
    const coordinates = mission.lastPosition?.coordinates;
    this.emergencySending.set(true);
    this.api
      .createMissionEmergency(mission.id, {
        type,
        note: this.emergencyNote().trim() || undefined,
        longitude: coordinates?.[0],
        latitude: coordinates?.[1],
      })
      .subscribe({
        next: (response) => {
          this.emergencySending.set(false);
          this.sosOpen.set(false);
          this.emergencyNote.set('');
          this.showToast('Alerte prioritaire transmise', response.message);
          this.loadDashboard(false, true);
        },
        error: () => {
          this.emergencySending.set(false);
          this.operationError.set(
            'L’alerte numérique n’a pas été transmise. Utilisez immédiatement les moyens radio ou téléphoniques.',
          );
        },
      });
  }

  protected callContact(): void {
    const phone = this.mission()?.contact.phone;
    if (!phone) {
      this.showToast(
        'Téléphone indisponible',
        'Aucun numéro client n’est rattaché à ce dossier.',
        true,
      );
      return;
    }
    window.location.href = `tel:${phone}`;
  }

  protected messageContact(): void {
    const phone = this.mission()?.contact.phone;
    if (!phone) {
      this.showToast(
        'Messagerie indisponible',
        'Aucun numéro client n’est rattaché à ce dossier.',
        true,
      );
      return;
    }
    window.location.href = `sms:${phone}`;
  }

  protected copyAddress(): void {
    const address = this.mission()?.contact.address;
    if (!address) return;
    void navigator.clipboard
      .writeText(address)
      .then(() =>
        this.showToast(
          'Adresse copiée',
          'L’adresse d’intervention est prête à être partagée.',
        ),
      )
      .catch(() =>
        this.showToast(
          'Copie indisponible',
          'Sélectionnez manuellement l’adresse du dossier.',
          true,
        ),
      );
  }

  protected openNavigation(): void {
    const mission = this.mission();
    if (!mission) return;
    const team = mission.lastPosition?.coordinates ?? [10.1764, 36.8427];
    const destination =
      mission.incident.location?.coordinates ?? [10.1855, 36.8375];
    window.open(
      `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${team[1]},${team[0]};${destination[1]},${destination[0]}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  protected zoomFieldMap(delta: number): void {
    this.fieldMap?.easeTo({
      zoom: (this.fieldMap?.getZoom() ?? 13) + delta,
      duration: 280,
    });
  }

  protected centerFieldMap(): void {
    const mission = this.mission();
    if (!mission || !this.fieldMap) return;
    const coordinates: StegCoordinates[] = [
      mission.incident.location?.coordinates ?? [10.1855, 36.8375],
    ];
    const team = mission.lastPosition?.coordinates;
    if (team) coordinates.push(team);
    fitStegMap(this.fieldMap, coordinates, 62);
  }

  protected toggleSafetyCheck(key: string): void {
    this.safetyChecks.update((checks) => ({
      ...checks,
      [key]: !checks[key],
    }));
  }

  protected statusLabel(status: string): string {
    return (
      this.statuses.find((item) => item.value === status)?.label ??
      status.replaceAll('_', ' ')
    );
  }

  protected shortStatusLabel(status: string): string {
    return (
      this.statuses.find((item) => item.value === status)?.short ??
      status.replaceAll('_', ' ')
    );
  }

  protected incidentTypeLabel(type: string): string {
    return (
      {
        outage: 'Coupure de courant',
        voltage: 'Tension instable',
        fire: 'Feu ou étincelles',
        wire: 'Câble dangereux',
        meter: 'Problème de compteur',
        other: 'Incident électrique',
      }[type] ?? type
    );
  }

  protected severityLabel(severity: string): string {
    return (
      {
        low: 'Faible',
        medium: 'Modérée',
        high: 'Élevée',
        critical: 'Critique',
      }[severity] ?? severity
    );
  }

  protected formatDuration(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (!hours) return `${remaining} min`;
    return `${hours} h ${String(remaining).padStart(2, '0')}`;
  }

  protected missionElapsed(): string {
    const mission = this.mission();
    if (!mission?.createdAt) return '00:00:00';
    const end = mission.closedAt
      ? new Date(mission.closedAt).getTime()
      : this.now();
    const seconds = Math.max(
      0,
      Math.floor((end - new Date(mission.createdAt).getTime()) / 1000),
    );
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    return [hours, minutes, remaining]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  protected arrivalTime(): string {
    const eta = this.mission()?.etaMinutes;
    if (eta === null || eta === undefined) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(Date.now() + eta * 60_000));
  }

  protected relativeTime(value: string | null | undefined): string {
    if (!value) return 'À l’instant';
    const minutes = Math.max(
      0,
      Math.round((Date.now() - new Date(value).getTime()) / 60_000),
    );
    if (minutes < 1) return 'À l’instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Il y a ${hours} h`;
    return `Il y a ${Math.round(hours / 24)} j`;
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected historyAverageDuration(): number {
    const items = this.dashboard()?.history ?? [];
    if (!items.length) return 0;
    return Math.round(
      items.reduce((total, item) => total + item.durationMinutes, 0) /
        items.length,
    );
  }

  protected historyPhotoCount(): number {
    return (this.dashboard()?.history ?? []).reduce(
      (total, item) => total + item.photoCount,
      0,
    );
  }

  private loadDashboard(showRefresh = false, silent = false): void {
    if (!silent) {
      if (showRefresh) this.refreshing.set(true);
      else this.loading.set(true);
    }
    this.api.getMaintenanceDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
        this.refreshing.set(false);
        this.operationError.set('');
        this.initializeReport(dashboard.activeMission);
        if (!dashboard.activeMission) {
          this.stopGps();
          this.fieldMap?.remove();
          this.fieldMap = undefined;
          this.mapElement = undefined;
          this.mapReady.set(false);
        } else {
          window.setTimeout(() => void this.renderMissionOnMap(), 0);
        }
        if (showRefresh) {
          this.showToast(
            'Données actualisées',
            'La mission et le centre des opérations sont synchronisés.',
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.operationError.set(
          'Le poste terrain ne peut pas joindre le centre des opérations.',
        );
      },
    });
  }

  private initializeReport(mission: MaintenanceMission | null): void {
    if (!mission || this.loadedMissionId === mission.id) return;
    this.loadedMissionId = mission.id;
    const draft = localStorage.getItem(this.reportDraftKey(mission.id));
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as {
          diagnosis?: string;
          estimate?: string;
          note?: string;
          requestedResources?: string[];
        };
        this.diagnosis.set(parsed.diagnosis ?? mission.diagnosis ?? '');
        this.estimate.set(
          parsed.estimate ??
            String(mission.estimatedRepairMinutes ?? 45),
        );
        this.note.set(parsed.note ?? mission.reportNotes ?? '');
        this.requestedResources.set(
          parsed.requestedResources ?? mission.requestedResources,
        );
        return;
      } catch {
        localStorage.removeItem(this.reportDraftKey(mission.id));
      }
    }
    this.diagnosis.set(mission.diagnosis ?? '');
    this.estimate.set(String(mission.estimatedRepairMinutes ?? 45));
    this.note.set(mission.reportNotes ?? '');
    this.requestedResources.set(mission.requestedResources);
  }

  private reportPayload(): UpdateMaintenanceReport {
    return {
      diagnosis: this.diagnosis().trim() || undefined,
      estimatedRepairMinutes: Number(this.estimate()) || undefined,
      notes: this.note().trim() || undefined,
      requestedResources: this.requestedResources(),
    };
  }

  private reportDraftKey(missionId: string) {
    return `stegfield-report-${missionId}`;
  }

  private transmitPosition(latitude: number, longitude: number): void {
    const mission = this.mission();
    if (!mission || this.gpsSyncing()) return;
    this.gpsSyncing.set(true);
    this.api
      .updateMissionPosition(mission.id, latitude, longitude)
      .subscribe({
        next: () => {
          this.gpsSyncing.set(false);
          this.loadDashboard(false, true);
        },
        error: () => {
          this.gpsSyncing.set(false);
          this.operationError.set(
            'La dernière position GPS sera renvoyée dès le retour du réseau.',
          );
        },
      });
  }

  private stopGps(): void {
    if (this.gpsWatchId !== undefined && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
    }
    this.gpsWatchId = undefined;
    this.gpsLastSentAt = 0;
    this.gpsActive.set(false);
  }

  private async initializeFieldMap(element: HTMLDivElement): Promise<void> {
    const mission = this.mission();
    if (!mission || !supportsStegMap()) return;
    if (this.fieldMap && this.mapElement === element) {
      await this.renderMissionOnMap();
      return;
    }
    this.fieldMap?.remove();
    this.mapElement = element;
    const destination =
      mission.incident.location?.coordinates ?? [10.1855, 36.8375];
    const team = mission.lastPosition?.coordinates ?? [10.1764, 36.8427];
    this.fieldMap = await createStegMap(element, team, 13.1);
    this.destinationMapMarker = await addStegMarker(
      this.fieldMap,
      destination,
      {
        tone: 'incident',
        label: mission.incident.reference,
        detail: `${mission.incident.address} · Priorité ${this.severityLabel(mission.incident.severity).toLowerCase()}`,
      },
    );
    await this.renderMissionOnMap();
    this.fieldMap.once('load', () => {
      this.mapReady.set(true);
      this.fieldMap?.resize();
      this.centerFieldMap();
    });
  }

  private async renderMissionOnMap(): Promise<void> {
    const mission = this.mission();
    if (!mission || !this.fieldMap) return;
    const team =
      mission.lastPosition?.coordinates ?? [10.1764, 36.8427];
    const destination =
      mission.incident.location?.coordinates ?? [10.1855, 36.8375];
    this.destinationMapMarker?.setLngLat(destination);
    if (this.teamMapMarker) {
      this.teamMapMarker.setLngLat(team);
    } else {
      this.teamMapMarker = await addStegMarker(this.fieldMap, team, {
        tone: 'team',
        label: this.team()?.vehicle ?? 'Votre véhicule',
        detail: 'Position exacte réservée au centre des opérations',
      });
    }
    drawStegRoute(this.fieldMap, 'maintenance-route', team, destination);
    if (this.mapReady()) fitStegMap(this.fieldMap, [team, destination], 62);
  }

  private initializeAppUpdates(): void {
    if (!this.swUpdate?.isEnabled) return;
    this.updateSubscription = this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type !== 'VERSION_READY') return;
      void this.swUpdate
        ?.activateUpdate()
        .then(() => window.location.reload())
        .catch(() => undefined);
    });
    void this.swUpdate.checkForUpdate().catch(() => undefined);
  }

  private readonly handleOnline = () => {
    this.online.set(true);
    this.showToast(
      'Connexion rétablie',
      'Synchronisation avec le centre des opérations relancée.',
    );
    this.loadDashboard(false, true);
  };

  private readonly handleOffline = () => {
    this.online.set(false);
    this.stopGps();
    this.showToast(
      'Mode hors connexion',
      'Le rapport reste sauvegardé sur cet appareil.',
      true,
    );
  };

  private showToast(title: string, message: string, isError = false): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTitle.set(title);
    this.toast.set(message);
    if (isError) this.operationError.set(message);
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4500);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
