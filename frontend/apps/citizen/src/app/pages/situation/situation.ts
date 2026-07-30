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
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { forkJoin } from 'rxjs';
import {
  AuthService,
  CitizenDashboard,
  CitizenMapData,
  CitizenSafety,
  StegApiService,
  addStegMarker,
  createStegMap,
  drawStegRoute,
  fitStegMap,
  removeStegRoute,
  supportsStegMap,
  whenStegMapReady,
  type StegCoordinates,
} from 'shared-data-access';

interface ReportType {
  id: string;
  label: string;
  hint: string;
  icon: string;
  urgent?: boolean;
}

@Component({
  selector: 'app-situation',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './situation.html',
  styleUrl: './situation.scss',
})
export class SituationPage implements OnInit, OnDestroy {
  private readonly api = inject(StegApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly dashboard = signal<CitizenDashboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Information enregistrée');
  protected readonly trackingMapReady = signal(false);

  protected readonly reportOpen = signal(false);
  protected readonly reportStep = signal(1);
  protected readonly selectedReport = signal('outage');
  protected readonly reportDescription = signal('');
  protected readonly consentAccepted = signal(true);
  protected readonly photoUrls = signal<string[]>([]);
  protected readonly photoUploading = signal(false);
  protected readonly detectedLocation = signal<{ coordinates: StegCoordinates; accuracy: number } | null>(null);

  protected readonly completedTimelineSteps = computed(() =>
    this.dashboard()?.timeline?.filter((s) => ['completed', 'current'].includes(s.state)).length ?? 0,
  );

  protected readonly reportTypes: ReportType[] = [
    { id: 'outage', label: 'Coupure de courant', hint: 'Pas de courant dans votre logement ou rue', icon: 'zap-off' },
    { id: 'voltage', label: 'Tension instable', hint: 'Faible tension, variations ou clignotements', icon: 'activity' },
    { id: 'meter', label: 'Problème de compteur', hint: 'Afficheur, bruit anormal ou coffret endommagé', icon: 'gauge' },
    { id: 'fire', label: 'Feu ou étincelles', hint: 'Compteur, câble ou transformateur dangereux', icon: 'flame', urgent: true },
    { id: 'wire', label: 'Câble endommagé', hint: 'Câble tombé ou accessible sur la voie publique', icon: 'cable', urgent: true },
    { id: 'other', label: 'Autre problème', hint: 'Une situation qui ne figure pas ici', icon: 'circle-help' },
  ];

  private trackingTimer?: number;
  private toastTimer?: number;
  private trackingMap?: MapLibreMap;
  private trackingMapElement?: HTMLDivElement;
  private teamMapMarker?: Marker;
  private homeMapMarker?: Marker;

  @ViewChild('trackingMapCanvas')
  set trackingMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeTrackingMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.trackingTimer) window.clearInterval(this.trackingTimer);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.trackingMap?.remove();
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
      this.operationError.set('Votre accord est nécessaire pour transmettre la position et les photos.');
      return;
    }
    this.saving.set(true);
    this.operationError.set('');
    const coordinates = this.detectedLocation()?.coordinates ?? this.homeCoordinates();
    this.api.createIncident({
      type: this.selectedReport(),
      description: this.reportDescription() || undefined,
      address: this.dashboard()?.profile?.address ?? this.auth.user()?.address ?? 'El Menzah 6',
      latitude: coordinates[1],
      longitude: coordinates[0],
      photos: this.photoUrls(),
      contractNumber: this.auth.user()?.contractNumber ?? undefined,
    }).subscribe({
      next: (incident) => {
        this.saving.set(false);
        this.reportOpen.set(false);
        this.reportDescription.set('');
        this.photoUrls.set([]);
        this.showToast('Signalement transmis', `${incident.reference} a été envoyé au centre STEG.`);
        window.setTimeout(() => this.loadData(), 350);
      },
      error: () => {
        this.saving.set(false);
        this.operationError.set("Le signalement n'a pas pu être transmis. Vérifiez votre connexion.");
      },
    });
  }

  protected confirmSituation(kind: 'outage_confirmed' | 'power_restored'): void {
    const data = this.dashboard();
    if (!data || this.saving()) return;
    this.saving.set(true);
    this.api.confirmCitizenSituation({ kind, zoneId: data.situation.zoneId, outageId: data.currentOutage?.id }).subscribe({
      next: (confirmation) => {
        this.saving.set(false);
        this.showToast(kind === 'power_restored' ? 'Rétablissement confirmé' : 'Coupure confirmée', confirmation.message);
        this.loadData();
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Confirmation non transmise', 'Service momentanément indisponible.', true);
      },
    });
  }

  protected onPhotoSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 3 - this.photoUrls().length);
    if (!files.length) return;
    this.photoUploading.set(true);
    let remaining = files.length;
    files.forEach((file) => {
      this.api.uploadPhoto(file).subscribe({
        next: ({ url }) => {
          this.photoUrls.update((p) => [...p, url].slice(0, 3));
          remaining -= 1;
          if (!remaining) this.photoUploading.set(false);
        },
        error: () => { remaining -= 1; this.photoUploading.set(false); this.operationError.set("Une photo n'a pas pu être envoyée."); },
      });
    });
  }

  protected removePhoto(photo: string): void {
    this.photoUrls.update((p) => p.filter((item) => item !== photo));
  }

  protected refreshClientLocation(): void {
    if (!navigator.geolocation) { this.operationError.set("La géolocalisation n'est pas disponible."); return; }
    this.operationError.set('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates: StegCoordinates = [coords.longitude, coords.latitude];
        this.detectedLocation.set({ coordinates, accuracy: Math.round(coords.accuracy) });
        this.homeMapMarker?.setLngLat(coordinates);
        this.showToast('Position actualisée', `Précision : ${Math.round(coords.accuracy)} mètres.`);
      },
      () => this.operationError.set('Position non détectée. Autorisez la localisation.'),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  protected goToMap(): void { this.router.navigate(['/map']); }
  protected goToSafety(): void { this.router.navigate(['/safety']); }

  protected situationTone(): 'outage' | 'scheduled' | 'normal' {
    const d = this.dashboard();
    if (d?.mission || d?.situation?.state === 'outage_confirmed') return 'outage';
    return d?.situation?.state === 'scheduled' ? 'scheduled' : 'normal';
  }

  protected situationLabel(state: string): string {
    return ({ intervention_in_progress: 'Intervention en cours', outage_confirmed: 'Coupure confirmée', scheduled: 'Coupure programmée', normal: 'Alimentation normale' } as Record<string, string>)[state] ?? state;
  }

  protected statusLabel(status: string): string {
    return ({ reported: 'Reçu', verified: 'Vérifié', in_progress: 'En traitement', resolved: 'Résolu', rejected: 'Rejeté', scheduled: 'Programmée', notified: 'Citoyens informés', active: 'En cours', restored: 'Rétablie', closed: 'Clôturée', normal: 'Normal', assigned: 'Affectée', accepted: 'Acceptée', en_route: 'En déplacement', on_site: 'Sur place', diagnosing: 'Diagnostic', repairing: 'Réparation', testing: 'Tests' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['critical', 'active', 'failed', 'rejected'].includes(status)) return 'danger';
    if (['scheduled', 'notified', 'pending_approval', 'reported', 'warning'].includes(status)) return 'warning';
    if (['resolved', 'restored', 'closed', 'normal', 'completed'].includes(status)) return 'success';
    return 'info';
  }

  protected incidentTypeLabel(type: string): string {
    return ({ outage: 'Coupure de courant', voltage: 'Tension instable', fire: 'Feu ou étincelles', wire: 'Câble dangereux', meter: 'Problème de compteur', other: 'Autre problème' } as Record<string, string>)[type] ?? type;
  }

  protected incidentIcon(type: string): string {
    return ({ outage: 'zap-off', voltage: 'activity', fire: 'flame', wire: 'cable', meter: 'gauge', other: 'circle-help' } as Record<string, string>)[type] ?? 'triangle-alert';
  }

  protected formatDate(value?: string | Date | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected formatTime(value?: string | Date | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected relativeTime(value?: string | Date | null): string {
    if (!value) return "À l'instant";
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `Il y a ${hours} h` : `Il y a ${Math.floor(hours / 24)} j`;
  }

  protected zoomTrackingMap(delta: number): void {
    this.trackingMap?.easeTo({ zoom: (this.trackingMap.getZoom() ?? 13) + delta, duration: 280 });
  }

  protected centerTrackingMap(): void {
    const team = this.teamMapMarker?.getLngLat();
    const coordinates: StegCoordinates[] = [this.homeCoordinates()];
    if (team) coordinates.push([team.lng, team.lat]);
    if (this.trackingMap) fitStegMap(this.trackingMap, coordinates, 62);
  }

  protected loadData(showToast = false): void {
    this.loading.set(true);
    this.pageError.set('');
    this.api.getCitizenDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
        this.syncTrackingMapState(dashboard);
        if (showToast) this.showToast('Données actualisées', 'Votre situation est synchronisée.');
      },
      error: () => { this.loading.set(false); this.pageError.set("Impossible de charger votre situation. Réessayez."); },
    });
    if (!this.trackingTimer) this.startTracking();
  }

  private startTracking(): void {
    if (this.trackingTimer) window.clearInterval(this.trackingTimer);
    this.trackingTimer = window.setInterval(() => {
      this.api.getCitizenDashboard().subscribe({ next: (d) => { this.dashboard.set(d); this.syncTrackingMapState(d); } });
    }, 15_000);
  }

  private async initializeTrackingMap(element: HTMLDivElement): Promise<void> {
    if (this.trackingMap && this.trackingMapElement === element) { this.trackingMap.resize(); return; }
    if (!supportsStegMap()) return;
    this.trackingMap?.remove();
    this.teamMapMarker = undefined;
    this.homeMapMarker = undefined;
    this.trackingMapElement = element;
    this.trackingMapReady.set(false);
    this.trackingMap = await createStegMap(element, this.homeCoordinates(), 13.1);
    this.homeMapMarker = await addStegMarker(this.trackingMap, this.homeCoordinates(), { tone: 'home', label: 'Votre adresse', detail: this.dashboard()?.profile?.address ?? 'Position associée à votre contrat STEG' });
    await this.renderTrackingMission();
    whenStegMapReady(this.trackingMap, () => { this.trackingMapReady.set(true); this.trackingMap?.resize(); this.centerTrackingMap(); });
  }

  private syncTrackingMapState(dashboard: CitizenDashboard): void {
    if (dashboard.mission) { void this.renderTrackingMission(); return; }
    this.trackingMap?.remove();
    this.trackingMap = undefined;
    this.trackingMapElement = undefined;
    this.teamMapMarker = undefined;
    this.homeMapMarker = undefined;
    this.trackingMapReady.set(false);
  }

  private async renderTrackingMission(): Promise<void> {
    if (!this.trackingMap) return;
    const mission = this.dashboard()?.mission;
    const approximatePosition = mission?.approximatePosition;
    const home = this.detectedLocation()?.coordinates ?? this.homeCoordinates();
    this.homeMapMarker?.setLngLat(home);
    if (!approximatePosition) {
      this.teamMapMarker?.remove();
      this.teamMapMarker = undefined;
      removeStegRoute(this.trackingMap, 'citizen-route');
      if (this.trackingMapReady()) fitStegMap(this.trackingMap, [home], 62);
      return;
    }
    const coordinates: StegCoordinates = [approximatePosition.longitude, approximatePosition.latitude];
    if (this.teamMapMarker) {
      this.teamMapMarker.setLngLat(coordinates);
    } else {
      this.teamMapMarker = await addStegMarker(this.trackingMap, coordinates, { tone: 'team', label: mission?.teamCode ?? 'Équipe STEG', detail: 'Position approximative et légèrement différée' });
    }
    drawStegRoute(this.trackingMap, 'citizen-route', coordinates, home);
    if (this.trackingMapReady()) fitStegMap(this.trackingMap, [coordinates, home], 62);
  }

  private homeCoordinates(): StegCoordinates {
    const detected = this.detectedLocation()?.coordinates;
    if (detected) return detected;
    const profile = this.dashboard()?.profile;
    return [profile?.longitude ?? 10.1764, profile?.latitude ?? 36.8427];
  }

  private showToast(title: string, message: string, isError = false): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    if (isError) this.operationError.set(message);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4600);
  }
}
