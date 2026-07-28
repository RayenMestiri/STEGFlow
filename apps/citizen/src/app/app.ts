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
import { forkJoin, Subscription } from 'rxjs';
import {
  AuthService,
  CitizenDashboard,
  CitizenMapData,
  CitizenMapIncident,
  CitizenPublicOutage,
  CitizenSafety,
  CitizenSafetyGuide,
  Login,
  StegApiService,
  addStegMarker,
  createStegMap,
  drawStegRoute,
  fitStegMap,
  supportsStegMap,
  type StegCoordinates,
} from 'shared-data-access';

type CitizenNav = 'situation' | 'map' | 'safety';
type MapFilter = 'all' | 'active' | 'scheduled' | 'incidents';
type SelectedMapItem =
  | { kind: 'outage'; value: CitizenPublicOutage }
  | { kind: 'incident'; value: CitizenMapIncident };

interface ReportType {
  id: string;
  label: string;
  hint: string;
  icon: string;
  urgent?: boolean;
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

  protected readonly activeNav = signal<CitizenNav>('situation');
  protected readonly dashboard = signal<CitizenDashboard | null>(null);
  protected readonly mapData = signal<CitizenMapData | null>(null);
  protected readonly safety = signal<CitizenSafety | null>(null);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Information enregistrée');

  protected readonly notificationsOpen = signal(false);
  protected readonly addressOpen = signal(false);
  protected readonly reportOpen = signal(false);
  protected readonly reportStep = signal(1);
  protected readonly selectedReport = signal('outage');
  protected readonly reportDescription = signal('');
  protected readonly consentAccepted = signal(true);
  protected readonly saving = signal(false);
  protected readonly photoUrls = signal<string[]>([]);
  protected readonly photoUploading = signal(false);
  protected readonly detectedLocation = signal<{
    coordinates: StegCoordinates;
    accuracy: number;
  } | null>(null);

  protected readonly mapFilter = signal<MapFilter>('all');
  protected readonly selectedMapItem = signal<SelectedMapItem | null>(null);
  protected readonly mapReady = signal(false);
  protected readonly trackingMapReady = signal(false);
  protected readonly expandedFaq = signal<string | null>('planned');
  protected readonly selectedGuide = signal<CitizenSafetyGuide | null>(null);

  protected readonly filteredMapOutages = computed(() => {
    const filter = this.mapFilter();
    const outages = this.mapData()?.outages ?? [];
    if (filter === 'incidents') return [];
    if (filter === 'active') {
      return outages.filter((outage) =>
        ['active', 'notified'].includes(outage.status),
      );
    }
    if (filter === 'scheduled') {
      return outages.filter((outage) => outage.status === 'scheduled');
    }
    return outages;
  });

  protected readonly filteredMapIncidents = computed(() =>
    ['all', 'incidents'].includes(this.mapFilter())
      ? (this.mapData()?.incidents ?? [])
      : [],
  );

  protected readonly activeMapOutageCount = computed(
    () =>
      this.mapData()?.outages.filter((outage) =>
        ['active', 'notified'].includes(outage.status),
      ).length ?? 0,
  );

  protected readonly scheduledMapOutageCount = computed(
    () =>
      this.mapData()?.outages.filter(
        (outage) => outage.status === 'scheduled',
      ).length ?? 0,
  );

  protected readonly unreadNotifications = computed(
    () =>
      this.dashboard()?.notifications.filter((notification) => notification.unread)
        .length ?? 0,
  );

  protected readonly completedTimelineSteps = computed(
    () =>
      this.dashboard()?.timeline.filter((step) =>
        ['completed', 'current'].includes(step.state),
      ).length ?? 0,
  );

  protected readonly reportTypes: ReportType[] = [
    {
      id: 'outage',
      label: 'Coupure de courant',
      hint: 'Pas de courant dans votre logement ou votre rue',
      icon: 'zap-off',
    },
    {
      id: 'voltage',
      label: 'Tension instable',
      hint: 'Faible tension, variations ou appareils qui clignotent',
      icon: 'activity',
    },
    {
      id: 'meter',
      label: 'Problème de compteur',
      hint: 'Afficheur, bruit anormal ou coffret endommagé',
      icon: 'gauge',
    },
    {
      id: 'fire',
      label: 'Feu ou étincelles',
      hint: 'Compteur, câble ou transformateur dangereux',
      icon: 'flame',
      urgent: true,
    },
    {
      id: 'wire',
      label: 'Câble endommagé',
      hint: 'Câble tombé ou accessible sur la voie publique',
      icon: 'cable',
      urgent: true,
    },
    {
      id: 'other',
      label: 'Autre problème',
      hint: 'Une situation électrique qui ne figure pas ici',
      icon: 'circle-help',
    },
  ];

  private trackingTimer?: number;
  private toastTimer?: number;
  private updateSubscription?: Subscription;
  private trackingMap?: MapLibreMap;
  private outageMap?: MapLibreMap;
  private trackingMapElement?: HTMLDivElement;
  private outageMapElement?: HTMLDivElement;
  private teamMapMarker?: Marker;
  private homeMapMarker?: Marker;
  private outageHomeMarker?: Marker;
  private readonly publicMapMarkers: Marker[] = [];

  @ViewChild('trackingMapCanvas')
  set trackingMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeTrackingMap(container.nativeElement);
  }

  @ViewChild('outageMapCanvas')
  set outageMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeOutageMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.initializeAppUpdates();
    this.auth.initialize().subscribe({ next: () => this.validateAccess() });
  }

  ngOnDestroy(): void {
    if (this.trackingTimer) window.clearInterval(this.trackingTimer);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.updateSubscription?.unsubscribe();
    this.trackingMap?.remove();
    this.outageMap?.remove();
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

  protected handleSignedIn(): void {
    this.validateAccess();
  }

  protected logout(): void {
    this.notificationsOpen.set(false);
    if (this.trackingTimer) window.clearInterval(this.trackingTimer);
    this.auth.logout().subscribe();
  }

  protected selectNav(nav: CitizenNav): void {
    this.activeNav.set(nav);
    this.notificationsOpen.set(false);
    this.addressOpen.set(false);
    this.selectedMapItem.set(null);
    window.setTimeout(() => {
      if (nav === 'situation') this.trackingMap?.resize();
      if (nav === 'map') {
        this.outageMap?.resize();
        void this.renderPublicMap();
      }
    }, 0);
  }

  protected refresh(): void {
    this.loadCitizenData(true);
  }

  protected openReport(type = 'outage'): void {
    this.selectedReport.set(type);
    this.reportStep.set(1);
    this.operationError.set('');
    this.reportOpen.set(true);
  }

  protected closeReport(): void {
    this.reportOpen.set(false);
    this.operationError.set('');
  }

  protected nextReportStep(): void {
    this.reportStep.set(2);
  }

  protected submitReport(): void {
    if (!this.consentAccepted()) {
      this.operationError.set(
        'Votre accord est nécessaire pour transmettre la position et les photos.',
      );
      return;
    }
    this.saving.set(true);
    this.operationError.set('');
    const coordinates =
      this.detectedLocation()?.coordinates ?? this.homeCoordinates();
    this.api
      .createIncident({
        type: this.selectedReport(),
        description: this.reportDescription() || undefined,
        address:
          this.dashboard()?.profile.address ??
          this.auth.user()?.address ??
          'El Menzah 6',
        latitude: coordinates[1],
        longitude: coordinates[0],
        photos: this.photoUrls(),
        contractNumber: this.auth.user()?.contractNumber ?? undefined,
      })
      .subscribe({
        next: (incident) => {
          this.saving.set(false);
          this.reportOpen.set(false);
          this.reportDescription.set('');
          this.photoUrls.set([]);
          this.showToast(
            'Signalement transmis',
            `${incident.reference} a été envoyé au centre des opérations STEG.`,
          );
          window.setTimeout(() => this.loadCitizenData(), 350);
        },
        error: () => {
          this.saving.set(false);
          this.operationError.set(
            'Le signalement n’a pas pu être transmis. Vérifiez votre connexion puis réessayez.',
          );
        },
      });
  }

  protected confirmSituation(
    kind: 'outage_confirmed' | 'power_restored',
  ): void {
    const data = this.dashboard();
    if (!data || this.saving()) return;
    this.saving.set(true);
    this.api
      .confirmCitizenSituation({
        kind,
        zoneId: data.situation.zoneId,
        outageId: data.currentOutage?.id,
      })
      .subscribe({
        next: (confirmation) => {
          this.saving.set(false);
          this.showToast(
            kind === 'power_restored'
              ? 'Rétablissement confirmé'
              : 'Coupure confirmée',
            confirmation.message,
          );
          this.loadCitizenData();
        },
        error: () => {
          this.saving.set(false);
          this.showToast(
            'Confirmation non transmise',
            'La connexion au service est momentanément indisponible.',
            true,
          );
        },
      });
  }

  protected onPhotoSelected(event: Event): void {
    const files = Array.from(
      (event.target as HTMLInputElement).files ?? [],
    ).slice(0, 3 - this.photoUrls().length);
    if (!files.length) return;
    this.photoUploading.set(true);
    this.operationError.set('');
    let remaining = files.length;
    files.forEach((file) => {
      this.api.uploadPhoto(file).subscribe({
        next: ({ url }) => {
          this.photoUrls.update((photos) => [...photos, url].slice(0, 3));
          remaining -= 1;
          if (!remaining) this.photoUploading.set(false);
        },
        error: () => {
          remaining -= 1;
          this.photoUploading.set(false);
          this.operationError.set(
            'Une photo n’a pas pu être envoyée. Formats acceptés : JPEG, PNG ou WebP.',
          );
        },
      });
    });
  }

  protected removePhoto(photo: string): void {
    this.photoUrls.update((photos) => photos.filter((item) => item !== photo));
  }

  protected refreshClientLocation(): void {
    if (!navigator.geolocation) {
      this.operationError.set(
        'La géolocalisation n’est pas disponible sur cet appareil.',
      );
      return;
    }
    this.operationError.set('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates: StegCoordinates = [
          coords.longitude,
          coords.latitude,
        ];
        this.detectedLocation.set({
          coordinates,
          accuracy: Math.round(coords.accuracy),
        });
        this.homeMapMarker?.setLngLat(coordinates);
        this.outageHomeMarker?.setLngLat(coordinates);
        void this.renderTrackingMission();
        this.showToast(
          'Position actualisée',
          `Précision estimée : ${Math.round(coords.accuracy)} mètres.`,
        );
      },
      () =>
        this.operationError.set(
          'Position non détectée. Autorisez la localisation ou conservez l’adresse du contrat.',
        ),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  protected setMapFilter(filter: MapFilter): void {
    this.mapFilter.set(filter);
    this.selectedMapItem.set(null);
    window.setTimeout(() => void this.renderPublicMap(), 0);
  }

  protected selectMapOutage(outage: CitizenPublicOutage): void {
    this.selectedMapItem.set({ kind: 'outage', value: outage });
    this.outageMap?.easeTo({
      center: [outage.longitude, outage.latitude],
      zoom: 14,
      duration: 500,
    });
  }

  protected selectMapIncident(incident: CitizenMapIncident): void {
    this.selectedMapItem.set({ kind: 'incident', value: incident });
    this.outageMap?.easeTo({
      center: [incident.longitude, incident.latitude],
      zoom: 14,
      duration: 500,
    });
  }

  protected zoomTrackingMap(delta: number): void {
    this.trackingMap?.easeTo({
      zoom: (this.trackingMap?.getZoom() ?? 13) + delta,
      duration: 280,
    });
  }

  protected zoomOutageMap(delta: number): void {
    this.outageMap?.easeTo({
      zoom: (this.outageMap?.getZoom() ?? 12) + delta,
      duration: 280,
    });
  }

  protected centerTrackingMap(): void {
    const team = this.teamMapMarker?.getLngLat();
    const coordinates: StegCoordinates[] = [this.homeCoordinates()];
    if (team) coordinates.push([team.lng, team.lat]);
    if (this.trackingMap) fitStegMap(this.trackingMap, coordinates, 62);
  }

  protected centerOutageMap(): void {
    const coordinates: StegCoordinates[] = [
      this.homeCoordinates(),
      ...this.filteredMapOutages().map(
        (outage) =>
          [outage.longitude, outage.latitude] as StegCoordinates,
      ),
      ...this.filteredMapIncidents().map(
        (incident) =>
          [incident.longitude, incident.latitude] as StegCoordinates,
      ),
    ];
    if (this.outageMap) fitStegMap(this.outageMap, coordinates, 70);
  }

  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }

  protected openGuide(guide: CitizenSafetyGuide): void {
    this.selectedGuide.set(guide);
  }

  protected async shareSituation(): Promise<void> {
    const data = this.dashboard();
    const text = data
      ? `STEGFlow — ${data.situation.zoneLabel}: ${this.situationLabel(
          data.situation.state,
        )}.`
      : 'Consultez la situation électrique sur STEGFlow.';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'STEGFlow', text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        this.showToast('Lien copié', 'Vous pouvez maintenant partager la situation.');
      }
    } catch {
      // L’annulation du partage natif ne nécessite aucun message d’erreur.
    }
  }

  protected situationLabel(state: CitizenDashboard['situation']['state']): string {
    return (
      {
        intervention_in_progress: 'Intervention en cours',
        outage_confirmed: 'Coupure confirmée',
        scheduled: 'Coupure programmée',
        normal: 'Alimentation normale',
      }[state] ?? state
    );
  }

  protected statusLabel(status: string): string {
    return (
      {
        reported: 'Reçu',
        verified: 'Vérifié',
        dispatched: 'Équipe affectée',
        in_progress: 'En traitement',
        resolved: 'Résolu',
        rejected: 'Rejeté',
        scheduled: 'Programmée',
        notified: 'Citoyens informés',
        active: 'En cours',
        restored: 'Rétablie',
        closed: 'Clôturée',
        assigned: 'Affectée',
        accepted: 'Acceptée',
        en_route: 'En déplacement',
        on_site: 'Sur place',
        diagnosing: 'Diagnostic',
        repairing: 'Réparation',
        testing: 'Tests',
      }[status] ?? status.replaceAll('_', ' ')
    );
  }

  /**
   * Teinte du bandeau d'accueil : une intervention ou une coupure confirmée
   * passe l'écran en rouge, une opération programmée en ambre, le reste en vert.
   */
  protected situationTone(): 'outage' | 'scheduled' | 'normal' {
    const dashboard = this.dashboard();
    if (dashboard?.mission || dashboard?.situation?.state === 'outage_confirmed') {
      return 'outage';
    }
    return dashboard?.situation?.state === 'scheduled' ? 'scheduled' : 'normal';
  }

  protected statusTone(status: string): string {
    if (['critical', 'active', 'failed', 'rejected'].includes(status))
      return 'danger';
    if (
      ['scheduled', 'notified', 'pending_approval', 'reported', 'warning'].includes(
        status,
      )
    )
      return 'warning';
    if (
      ['resolved', 'restored', 'closed', 'normal', 'completed'].includes(status)
    )
      return 'success';
    return 'info';
  }

  protected incidentTypeLabel(type: string): string {
    return (
      {
        outage: 'Coupure de courant',
        voltage: 'Tension instable',
        fire: 'Feu ou étincelles',
        wire: 'Câble dangereux',
        meter: 'Problème de compteur',
        other: 'Autre problème',
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

  protected incidentIcon(type: string): string {
    return (
      {
        outage: 'zap-off',
        voltage: 'activity',
        fire: 'flame',
        wire: 'cable',
        meter: 'gauge',
        other: 'circle-help',
      }[type] ?? 'triangle-alert'
    );
  }

  protected formatDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected formatTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected relativeTime(value: string | Date | null | undefined): string {
    if (!value) return 'À l’instant';
    const minutes = Math.max(
      0,
      Math.round((Date.now() - new Date(value).getTime()) / 60_000),
    );
    if (minutes < 1) return 'À l’instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours} h`;
    return `Il y a ${Math.floor(hours / 24)} j`;
  }

  private validateAccess(): void {
    if (!this.auth.isAuthenticated()) return;
    this.auth.requireRole(['citizen']).subscribe({
      next: () => {
        this.loadCitizenData();
        this.startTracking();
      },
      error: (error) => this.pageError.set(error.message),
    });
  }

  private loadCitizenData(showToast = false): void {
    showToast ? this.refreshing.set(true) : this.loading.set(true);
    this.pageError.set('');
    forkJoin({
      dashboard: this.api.getCitizenDashboard(),
      map: this.api.getCitizenMap(),
      safety: this.api.getCitizenSafety(),
    }).subscribe({
      next: (result) => {
        this.dashboard.set(result.dashboard);
        this.mapData.set(result.map);
        this.safety.set(result.safety);
        this.loading.set(false);
        this.refreshing.set(false);
        void this.renderTrackingMission();
        void this.renderPublicMap();
        if (showToast) {
          this.showToast(
            'Données actualisées',
            'Votre situation est synchronisée avec le centre STEG.',
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.pageError.set(
          'Votre espace n’a pas pu synchroniser toutes les données. Réessayez dans quelques instants.',
        );
      },
    });
  }

  private startTracking(): void {
    if (this.trackingTimer) window.clearInterval(this.trackingTimer);
    this.trackingTimer = window.setInterval(() => {
      this.api.getCitizenDashboard().subscribe({
        next: (dashboard) => {
          this.dashboard.set(dashboard);
          void this.renderTrackingMission();
        },
      });
    }, 15_000);
  }

  private async initializeTrackingMap(element: HTMLDivElement): Promise<void> {
    if (this.trackingMap && this.trackingMapElement === element) {
      this.trackingMap.resize();
      return;
    }
    if (!supportsStegMap()) return;
    this.trackingMap?.remove();
    this.teamMapMarker = undefined;
    this.homeMapMarker = undefined;
    this.trackingMapElement = element;
    this.trackingMapReady.set(false);
    this.trackingMap = await createStegMap(element, this.homeCoordinates(), 13.1);
    this.homeMapMarker = await addStegMarker(
      this.trackingMap,
      this.homeCoordinates(),
      {
        tone: 'home',
        label: 'Votre adresse',
        detail:
          this.dashboard()?.profile.address ??
          'Position associée à votre contrat STEG',
      },
    );
    await this.renderTrackingMission();
    this.trackingMap.once('load', () => {
      this.trackingMapReady.set(true);
      this.trackingMap?.resize();
      this.centerTrackingMap();
    });
  }

  private async renderTrackingMission(): Promise<void> {
    if (!this.trackingMap) return;
    const mission = this.dashboard()?.mission;
    const coordinates: StegCoordinates = mission?.approximatePosition
      ? [
          mission.approximatePosition.longitude,
          mission.approximatePosition.latitude,
        ]
      : [10.166, 36.849];
    if (this.teamMapMarker) {
      this.teamMapMarker.setLngLat(coordinates);
    } else {
      this.teamMapMarker = await addStegMarker(
        this.trackingMap,
        coordinates,
        {
          tone: 'team',
          label: mission?.teamCode ?? 'Équipe STEG',
          detail: 'Position approximative, arrondie et légèrement différée',
        },
      );
    }
    const home = this.detectedLocation()?.coordinates ?? this.homeCoordinates();
    this.homeMapMarker?.setLngLat(home);
    drawStegRoute(this.trackingMap, 'citizen-route', coordinates, home);
    if (this.trackingMapReady()) {
      fitStegMap(this.trackingMap, [coordinates, home], 62);
    }
  }

  private async initializeOutageMap(element: HTMLDivElement): Promise<void> {
    if (this.outageMap && this.outageMapElement === element) {
      this.outageMap.resize();
      return;
    }
    if (!supportsStegMap()) return;
    this.outageMap?.remove();
    this.outageMapElement = element;
    this.mapReady.set(false);
    this.outageMap = await createStegMap(element, this.homeCoordinates(), 11.5);
    this.outageHomeMarker = await addStegMarker(
      this.outageMap,
      this.homeCoordinates(),
      {
        tone: 'home',
        label: 'Votre adresse',
        detail: this.dashboard()?.profile.address ?? 'Adresse du contrat',
      },
    );
    await this.renderPublicMap();
    this.outageMap.once('load', () => {
      this.mapReady.set(true);
      this.outageMap?.resize();
      this.centerOutageMap();
    });
  }

  private async renderPublicMap(): Promise<void> {
    if (!this.outageMap) return;
    this.publicMapMarkers.splice(0).forEach((marker) => marker.remove());

    for (const outage of this.filteredMapOutages()) {
      const marker = await addStegMarker(
        this.outageMap,
        [outage.longitude, outage.latitude],
        {
          tone: 'outage',
          label: `${outage.zoneLabel} · ${this.statusLabel(outage.status)}`,
          detail: `${outage.reason} · ${outage.affectedCustomers.toLocaleString(
            'fr-FR',
          )} clients`,
          showLabel: this.filteredMapOutages().length <= 3,
        },
      );
      marker
        .getElement()
        .addEventListener('click', () => this.selectMapOutage(outage));
      this.publicMapMarkers.push(marker);
    }

    for (const incident of this.filteredMapIncidents()) {
      const marker = await addStegMarker(
        this.outageMap,
        [incident.longitude, incident.latitude],
        {
          tone: 'incident',
          label: `${this.incidentTypeLabel(incident.type)} · ${incident.zoneLabel}`,
          detail: `${incident.communityConfirmations} confirmation(s) citoyenne(s)`,
          showLabel: false,
        },
      );
      marker
        .getElement()
        .addEventListener('click', () => this.selectMapIncident(incident));
      this.publicMapMarkers.push(marker);
    }

    this.outageHomeMarker?.setLngLat(this.homeCoordinates());
    if (this.mapReady()) this.centerOutageMap();
  }

  private homeCoordinates(): StegCoordinates {
    const detected = this.detectedLocation()?.coordinates;
    if (detected) return detected;
    const profile = this.dashboard()?.profile;
    return [
      profile?.longitude ?? this.mapData()?.center.longitude ?? 10.1764,
      profile?.latitude ?? this.mapData()?.center.latitude ?? 36.8427,
    ];
  }

  private showToast(title: string, message: string, isError = false): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    if (isError) this.operationError.set(message);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4600);
  }
}
