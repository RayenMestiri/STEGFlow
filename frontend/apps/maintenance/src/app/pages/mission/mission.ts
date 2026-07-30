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
import {
  AuthService,
  MaintenanceDashboard,
  MaintenanceMission,
  StegApiService,
  addStegMarker,
  createStegMap,
  fitStegMap,
  supportsStegMap,
  whenStegMapReady,
  type StegCoordinates,
} from 'shared-data-access';

interface MissionStatus {
  value: string;
  label: string;
  short: string;
  action: string;
  icon: string;
}

@Component({
  selector: 'app-mission',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './mission.html',
  styleUrl: './mission.scss',
})
export class MissionPage implements OnInit, OnDestroy {
  private readonly api = inject(StegApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly dashboard = signal<MaintenanceDashboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly syncing = signal(false);
  protected readonly gpsSyncing = signal(false);
  protected readonly gpsActive = signal(false);
  protected readonly online = signal(navigator.onLine);
  protected readonly mapReady = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly sosOpen = signal(false);
  protected readonly emergencySending = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Mise à jour synchronisée');
  protected readonly emergencyNote = signal('');
  protected readonly safetyChecks = signal<{ ppe: boolean; voltage: boolean; perimeter: boolean; tools: boolean }>({ ppe: true, voltage: false, perimeter: false, tools: true });
  protected readonly now = signal(Date.now());

  protected readonly statuses: MissionStatus[] = [
    { value: 'assigned', label: 'Mission affectée', short: 'Affectée', action: 'Accepter la mission', icon: 'clipboard-check' },
    { value: 'accepted', label: 'En route', short: 'Acceptée', action: 'Déclarer le départ', icon: 'navigation' },
    { value: 'en_route', label: 'En déplacement', short: 'En route', action: 'Arrivé sur site', icon: 'map-pin-check' },
    { value: 'on_site', label: 'Sur place', short: 'Sur place', action: 'Démarrer le diagnostic', icon: 'scan-search' },
    { value: 'diagnosing', label: 'Diagnostic', short: 'Diagnostic', action: 'Démarrer la réparation', icon: 'search' },
    { value: 'repairing', label: 'Réparation en cours', short: 'Réparation', action: 'Commencer les tests', icon: 'wrench' },
    { value: 'testing', label: 'Tests et vérifications', short: 'Tests', action: 'Confirmer la résolution', icon: 'list-checks' },
    { value: 'resolved', label: 'Résolu', short: 'Résolu', action: 'Mission clôturée', icon: 'circle-check-big' },
  ];

  protected readonly missionProgress = computed(() => {
    const mission = this.dashboard()?.activeMission;
    if (!mission) return 0;
    const index = this.statuses.findIndex((s) => s.value === mission.status);
    return index >= 0 ? Math.round(((index + 1) / this.statuses.length) * 100) : 0;
  });

  protected readonly safetyCheckCount = computed(() =>
    Object.values(this.safetyChecks()).filter(Boolean).length,
  );

  protected nextStatus(currentStatus: string): MissionStatus | null {
    const index = this.statuses.findIndex((s) => s.value === currentStatus);
    return index >= 0 && index < this.statuses.length - 1 ? this.statuses[index + 1] : null;
  }

  private missionMap?: MapLibreMap;
  private missionMapElement?: HTMLDivElement;
  private teamMarker?: Marker;
  private destinationMarker?: Marker;
  private gpsInterval?: number;
  private nowInterval?: number;
  private toastTimer?: number;

  @ViewChild('missionMapCanvas')
  set missionMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeMissionMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.loadData();
    this.nowInterval = window.setInterval(() => this.now.set(Date.now()), 60_000);
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }

  ngOnDestroy(): void {
    if (this.gpsInterval) window.clearInterval(this.gpsInterval);
    if (this.nowInterval) window.clearInterval(this.nowInterval);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.missionMap?.remove();
  }

  protected advanceMissionStatus(): void {
    const mission = this.dashboard()?.activeMission;
    if (!mission) return;
    const current = this.statuses.findIndex((s) => s.value === mission.status);
    if (current < 0 || current >= this.statuses.length - 1) return;
    const next = this.statuses[current + 1];
    this.syncing.set(true);
    this.api.updateMissionStatus(mission.id, next.value).subscribe({
      next: (updated) => {
        this.dashboard.update((d) => d ? { ...d, activeMission: { ...d.activeMission!, ...updated } as MaintenanceMission } : d);
        this.syncing.set(false);
        this.showToast('Statut mis à jour', `Mission → « ${next.label} ».`);
        const am = this.dashboard()?.activeMission;
        if (am) this.syncMapToMission(am);
      },
      error: () => { this.syncing.set(false); this.showToast('Erreur', 'Le statut n\'a pas pu être mis à jour.'); },
    });
  }

  protected sendSos(type: string): void {
    const mission = this.dashboard()?.activeMission;
    if (!mission || this.emergencySending()) return;
    this.emergencySending.set(true);
    this.api.createMissionEmergency(mission.id, { type: type as 'accident' | 'electrical' | 'security', note: this.emergencyNote() }).subscribe({
      next: () => {
        this.emergencySending.set(false);
        this.sosOpen.set(false);
        this.emergencyNote.set('');
        this.showToast('Alerte envoyée', 'Le centre des opérations a été notifié.');
      },
      error: () => { this.emergencySending.set(false); this.showToast('Erreur', 'L\'alerte n\'a pas pu être envoyée.'); },
    });
  }

  protected toggleGps(): void {
    if (this.gpsActive()) {
      this.gpsActive.set(false);
      if (this.gpsInterval) window.clearInterval(this.gpsInterval);
      return;
    }
    this.gpsActive.set(true);
    const push = () => {
      const mission = this.dashboard()?.activeMission;
      if (!mission || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          this.gpsSyncing.set(true);
          this.api.updateMissionPosition(mission.id, coords.latitude, coords.longitude).subscribe({
            next: () => { this.gpsSyncing.set(false); this.teamMarker?.setLngLat([coords.longitude, coords.latitude]); },
            error: () => this.gpsSyncing.set(false),
          });
        },
        undefined,
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    };
    push();
    this.gpsInterval = window.setInterval(push, 30_000);
  }

  protected goToReport(): void { this.router.navigate(['/report']); }

  protected elapsedTime(startedAt?: string | null): string {
    if (!startedAt) return '0 min';
    const minutes = Math.max(0, Math.round((this.now() - new Date(startedAt).getTime()) / 60_000));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  protected statusLabel(status: string): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }

  protected statusTone(status: string): string {
    if (['repairing', 'testing'].includes(status)) return 'warning';
    if (['resolved', 'on_site'].includes(status)) return 'success';
    if (['en_route', 'diagnosing'].includes(status)) return 'info';
    return 'neutral';
  }

  protected formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected loadData(): void {
    this.loading.set(true);
    this.pageError.set('');
    this.api.getMaintenanceDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
        if (dashboard.activeMission) this.syncMapToMission(dashboard.activeMission);
      },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger la mission.'); },
    });
  }

  private async initializeMissionMap(element: HTMLDivElement): Promise<void> {
    const mission = this.dashboard()?.activeMission;
    const loc = mission?.incident?.location;
    if (!loc?.coordinates) return;
    if (this.missionMap && this.missionMapElement === element) { this.missionMap.resize(); return; }
    if (!supportsStegMap()) return;
    this.missionMap?.remove();
    this.missionMapElement = element;
    this.mapReady.set(false);
    const center: StegCoordinates = [loc.coordinates[0], loc.coordinates[1]];
    this.missionMap = await createStegMap(element, center, 13);
    this.destinationMarker = await addStegMarker(this.missionMap, center, { tone: 'incident', label: 'Destination', detail: mission!.incident.address });
    whenStegMapReady(this.missionMap, () => { this.mapReady.set(true); this.missionMap?.resize(); });
  }

  private syncMapToMission(mission: MaintenanceMission): void {
    if (mission.lastPosition && this.missionMap) {
      const coords = mission.lastPosition.coordinates;
      const lngLat: StegCoordinates = [coords[0], coords[1]];
      if (this.teamMarker) { this.teamMarker.setLngLat(lngLat); }
    }
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4200);
  }
}
