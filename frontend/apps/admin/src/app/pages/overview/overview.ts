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
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { forkJoin } from 'rxjs';
import {
  AdminDashboard,
  FieldTeam,
  Incident,
  Mission,
  Outage,
  StegApiService,
  addStegMarker,
  createStegMap,
  fitStegMap,
  supportsStegMap,
  whenStegMapReady,
  type StegCoordinates,
} from 'shared-data-access';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class OverviewPage implements OnInit, OnDestroy {
  private readonly api = inject(StegApiService);
  private readonly router = inject(Router);

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly outages = signal<Outage[]>([]);
  protected readonly incidentRecords = signal<Incident[]>([]);
  protected readonly teams = signal<FieldTeam[]>([]);
  protected readonly operationsMissions = signal<Mission[]>([]);
  protected readonly loading = signal(false);
  protected readonly pageError = signal('');
  protected readonly mapReady = signal(false);
  protected readonly operationalLayersVisible = signal(true);

  protected readonly priorityIncidents = computed(() =>
    [...this.incidentRecords()]
      .filter((i) => !['resolved', 'rejected'].includes(i.status))
      .sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity))
      .slice(0, 3),
  );

  private operationsMap?: MapLibreMap;
  private mapElement?: HTMLDivElement;
  private readonly incidentMapMarkers: Marker[] = [];
  private readonly teamMapMarkers: Marker[] = [];
  private readonly outageMapMarkers: Marker[] = [];
  private operationsTimer?: number;

  @ViewChild('networkMapCanvas')
  set networkMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeOperationsMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.operationsTimer) window.clearInterval(this.operationsTimer);
    this.operationsMap?.remove();
  }

  protected goToIncidents(): void {
    this.router.navigate(['/incidents']);
  }

  protected goToOutages(): void {
    this.router.navigate(['/outages']);
  }

  protected goToTeams(): void {
    this.router.navigate(['/teams']);
  }

  protected goToNotifications(): void {
    this.router.navigate(['/notifications']);
  }

  protected zoomMap(delta: number): void {
    if (!this.operationsMap) return;
    this.operationsMap.easeTo({ zoom: Math.max(4, Math.min(18, this.operationsMap.getZoom() + delta)), duration: 300 });
  }

  protected centerMap(): void {
    const coords = [
      ...this.outageMapMarkers.map((m) => { const p = m.getLngLat(); return [p.lng, p.lat] as StegCoordinates; }),
      ...this.teamMapMarkers.map((m) => { const p = m.getLngLat(); return [p.lng, p.lat] as StegCoordinates; }),
      ...this.incidentMapMarkers.map((m) => { const p = m.getLngLat(); return [p.lng, p.lat] as StegCoordinates; }),
    ];
    if (this.operationsMap) {
      coords.length ? fitStegMap(this.operationsMap, coords, 64)
        : this.operationsMap.flyTo({ center: [10.1815, 36.826], zoom: 11.5, duration: 400 });
    }
  }

  protected toggleLayers(): void {
    this.operationalLayersVisible.update((v) => !v);
    const display = this.operationalLayersVisible() ? '' : 'none';
    [...this.incidentMapMarkers, ...this.teamMapMarkers].forEach((m) => (m.getElement().style.display = display));
  }

  protected statusLabel(status: string): string {
    return ({ active: 'En cours', scheduled: 'Programmée', available: 'Disponible', on_mission: 'En mission', en_route: 'En déplacement', on_site: 'Sur place' } as Record<string, string>)[status] ?? status;
  }

  protected relativeTime(value?: string | null): string {
    if (!value) return 'Jamais';
    const minutes = Math.max(0, Math.round((Date.now() - +new Date(value)) / 60_000));
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `Il y a ${hours} h` : new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short' }).format(new Date(value));
  }

  protected formatTime(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected statusTone(status: string): string {
    if (['active', 'critical', 'failed', 'rejected', 'offline'].includes(status)) return 'danger';
    if (['pending_approval', 'reported', 'high', 'partial', 'returning', 'queued'].includes(status)) return 'warning';
    if (['scheduled', 'notified', 'verified', 'dispatched', 'on_mission', 'sending', 'en_route'].includes(status)) return 'info';
    if (['restored', 'closed', 'resolved', 'available', 'delivered'].includes(status)) return 'success';
    return 'neutral';
  }

  protected incidentTypeLabel(type: string): string {
    return ({ outage: 'Coupure non déclarée', voltage: 'Tension instable', fire: 'Incendie', wire: 'Câble dangereux', meter: 'Compteur endommagé', other: 'Autre' } as Record<string, string>)[type] ?? type;
  }

  protected loadData(): void {
    this.loading.set(true);
    this.pageError.set('');
    forkJoin({
      dashboard: this.api.getAdminDashboard(),
      outages: this.api.getOutages(),
      incidents: this.api.getIncidents(),
      teams: this.api.getTeams(),
      missions: this.api.getOperationsTracking(),
    }).subscribe({
      next: (result) => {
        this.dashboard.set(result.dashboard);
        this.outages.set(result.outages);
        this.incidentRecords.set(result.incidents);
        this.teams.set(result.teams);
        this.operationsMissions.set(result.missions);
        this.loading.set(false);
        void this.renderOutages(result.outages);
        void this.renderTeams(result.missions);
        void this.renderIncidents(result.incidents);
        this.startTracking();
      },
      error: () => { this.loading.set(false); this.pageError.set("Impossible de charger les données. Réessayez."); },
    });
  }

  private startTracking(): void {
    if (this.operationsTimer) window.clearInterval(this.operationsTimer);
    this.operationsTimer = window.setInterval(() => {
      this.api.getOperationsTracking().subscribe((missions) => { this.operationsMissions.set(missions); void this.renderTeams(missions); });
      this.api.getIncidents().subscribe((incidents) => { this.incidentRecords.set(incidents); void this.renderIncidents(incidents); });
    }, 15_000);
  }

  private async initializeOperationsMap(element: HTMLDivElement): Promise<void> {
    if (this.operationsMap && this.mapElement === element) { this.operationsMap.resize(); return; }
    if (!supportsStegMap()) { this.pageError.set('La carte nécessite WebGL.'); return; }
    this.operationsMap?.remove();
    this.mapElement = element;
    this.mapReady.set(false);
    this.operationsMap = await createStegMap(element, [10.1815, 36.8065], 10.8);
    whenStegMapReady(this.operationsMap, () => { this.mapReady.set(true); this.operationsMap?.resize(); this.centerMap(); });
    await this.renderOutages(this.outages());
    await this.renderTeams(this.operationsMissions());
    await this.renderIncidents(this.incidentRecords());
  }

  private async renderOutages(outages: Outage[]): Promise<void> {
    if (!this.operationsMap) return;
    this.outageMapMarkers.splice(0).forEach((m) => m.remove());
    for (const outage of outages) {
      if (outage.longitude == null || outage.latitude == null) continue;
      this.outageMapMarkers.push(await addStegMarker(this.operationsMap, [outage.longitude, outage.latitude], { tone: 'outage', label: `${outage.reference} · ${outage.zoneLabel}`, detail: `${outage.affectedCustomers ?? 0} clients`, showLabel: outages.length <= 4 }));
    }
    if (this.mapReady()) this.centerMap();
  }

  private async renderTeams(missions: Mission[]): Promise<void> {
    if (!this.operationsMap) return;
    this.teamMapMarkers.splice(0).forEach((m) => m.remove());
    const positions = new Map<string, { coords: StegCoordinates; detail: string }>();
    for (const mission of missions) {
      const coords = this.extractCoords(mission.lastPosition);
      if (coords) positions.set(mission.teamCode, { coords, detail: `${mission.reference} · ${mission.etaMinutes ?? '—'} min` });
    }
    for (const team of this.teams()) {
      if (!positions.has(team.code)) {
        const coords = this.extractCoords((team as any).location);
        if (coords) positions.set(team.code, { coords, detail: `${team.code} · ${team.status}` });
      }
    }
    for (const [code, info] of positions.entries()) {
      this.teamMapMarkers.push(await addStegMarker(this.operationsMap, info.coords, { tone: 'team', label: code, detail: info.detail, showLabel: true }));
    }
    if (this.mapReady()) this.centerMap();
  }

  private async renderIncidents(incidents: Incident[]): Promise<void> {
    if (!this.operationsMap) return;
    this.incidentMapMarkers.splice(0).forEach((m) => m.remove());
    for (const incident of incidents) {
      const coords = this.extractCoords(incident.location);
      if (!coords) continue;
      this.incidentMapMarkers.push(await addStegMarker(this.operationsMap, coords, { tone: incident.severity === 'critical' ? 'incident' : 'outage', label: `${incident.reference} · ${this.incidentTypeLabel(incident.type)}`, detail: incident.address, showLabel: true }));
    }
    if (this.mapReady()) this.centerMap();
  }

  private extractCoords(raw: any): StegCoordinates | null {
    if (!raw) return null;
    if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) return [Number(raw.coordinates[0]), Number(raw.coordinates[1])];
    if (typeof raw.longitude === 'number' && typeof raw.latitude === 'number') return [raw.longitude, raw.latitude];
    return null;
  }

  private severityWeight(severity: string): number {
    return { critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 0;
  }
}
