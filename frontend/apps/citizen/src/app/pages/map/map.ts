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
import { LucideAngularModule } from 'lucide-angular';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import {
  CitizenMapData,
  CitizenMapIncident,
  CitizenPublicOutage,
  StegApiService,
  addStegMarker,
  createStegMap,
  fitStegMap,
  supportsStegMap,
  whenStegMapReady,
  type StegCoordinates,
} from 'shared-data-access';

type MapFilter = 'all' | 'active' | 'scheduled' | 'incidents';
type SelectedMapItem =
  | { kind: 'outage'; value: CitizenPublicOutage }
  | { kind: 'incident'; value: CitizenMapIncident };

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapPage implements OnInit, OnDestroy {
  private readonly api = inject(StegApiService);

  protected readonly mapData = signal<CitizenMapData | null>(null);
  protected readonly loading = signal(false);
  protected readonly mapReady = signal(false);
  protected readonly pageError = signal('');
  protected readonly mapFilter = signal<MapFilter>('all');
  protected readonly selectedMapItem = signal<SelectedMapItem | null>(null);

  protected readonly filteredMapOutages = computed(() => {
    const filter = this.mapFilter();
    const outages = this.mapData()?.outages ?? [];
    if (filter === 'incidents') return [];
    if (filter === 'active') return outages.filter((o) => ['active', 'notified'].includes(o.status));
    if (filter === 'scheduled') return outages.filter((o) => o.status === 'scheduled');
    return outages;
  });

  protected readonly filteredMapIncidents = computed(() =>
    ['all', 'incidents'].includes(this.mapFilter()) ? (this.mapData()?.incidents ?? []) : [],
  );

  protected readonly activeMapOutageCount = computed(() =>
    this.mapData()?.outages.filter((o) => ['active', 'notified'].includes(o.status)).length ?? 0,
  );

  protected readonly scheduledMapOutageCount = computed(() =>
    this.mapData()?.outages.filter((o) => o.status === 'scheduled').length ?? 0,
  );

  private outageMap?: MapLibreMap;
  private outageMapElement?: HTMLDivElement;
  private outageHomeMarker?: Marker;
  private readonly publicMapMarkers: Marker[] = [];

  @ViewChild('outageMapCanvas')
  set outageMapCanvas(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) return;
    void this.initializeOutageMap(container.nativeElement);
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.outageMap?.remove();
  }

  protected setMapFilter(filter: MapFilter): void {
    this.mapFilter.set(filter);
    this.selectedMapItem.set(null);
    window.setTimeout(() => void this.renderPublicMap(), 0);
  }

  protected selectMapOutage(outage: CitizenPublicOutage): void {
    this.selectedMapItem.set({ kind: 'outage', value: outage });
    this.outageMap?.easeTo({ center: [outage.longitude, outage.latitude], zoom: 14, duration: 500 });
  }

  protected selectMapIncident(incident: CitizenMapIncident): void {
    this.selectedMapItem.set({ kind: 'incident', value: incident });
    this.outageMap?.easeTo({ center: [incident.longitude, incident.latitude], zoom: 14, duration: 500 });
  }

  protected zoomOutageMap(delta: number): void {
    this.outageMap?.easeTo({ zoom: (this.outageMap.getZoom() ?? 12) + delta, duration: 280 });
  }

  protected centerOutageMap(): void {
    const home = this.homeCoordinates();
    const coordinates: StegCoordinates[] = [
      home,
      ...this.filteredMapOutages().map((o) => [o.longitude, o.latitude] as StegCoordinates),
      ...this.filteredMapIncidents().map((i) => [i.longitude, i.latitude] as StegCoordinates),
    ];
    if (this.outageMap) fitStegMap(this.outageMap, coordinates, 70);
  }

  protected statusLabel(status: string): string {
    return ({ scheduled: 'Programmée', notified: 'Citoyens informés', active: 'En cours', restored: 'Rétablie', closed: 'Clôturée' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['active', 'critical', 'failed'].includes(status)) return 'danger';
    if (['scheduled', 'notified', 'reported'].includes(status)) return 'warning';
    if (['resolved', 'restored', 'closed'].includes(status)) return 'success';
    return 'info';
  }

  protected incidentTypeLabel(type: string): string {
    return ({ outage: 'Coupure de courant', voltage: 'Tension instable', fire: 'Feu ou étincelles', wire: 'Câble dangereux', meter: 'Problème de compteur', other: 'Autre' } as Record<string, string>)[type] ?? type;
  }

  protected severityLabel(severity: string): string {
    return ({ low: 'Faible', medium: 'Modérée', high: 'Élevée', critical: 'Critique' } as Record<string, string>)[severity] ?? severity;
  }

  protected formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected formatTime(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getCitizenMap().subscribe({
      next: (mapData) => { this.mapData.set(mapData); this.loading.set(false); void this.renderPublicMap(); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les données cartographiques.'); },
    });
  }

  private async initializeOutageMap(element: HTMLDivElement): Promise<void> {
    if (this.outageMap && this.outageMapElement === element) { this.outageMap.resize(); return; }
    if (!supportsStegMap()) return;
    this.outageMap?.remove();
    this.outageMapElement = element;
    this.mapReady.set(false);
    this.outageMap = await createStegMap(element, this.homeCoordinates(), 11.5);
    this.outageHomeMarker = await addStegMarker(this.outageMap, this.homeCoordinates(), { tone: 'home', label: 'Votre adresse', detail: 'Adresse du contrat' });
    await this.renderPublicMap();
    whenStegMapReady(this.outageMap, () => { this.mapReady.set(true); this.outageMap?.resize(); this.centerOutageMap(); });
  }

  private async renderPublicMap(): Promise<void> {
    if (!this.outageMap) return;
    this.publicMapMarkers.splice(0).forEach((m) => m.remove());
    for (const outage of this.filteredMapOutages()) {
      const marker = await addStegMarker(this.outageMap, [outage.longitude, outage.latitude], { tone: 'outage', label: `${outage.zoneLabel} · ${this.statusLabel(outage.status)}`, detail: `${outage.reason} · ${outage.affectedCustomers.toLocaleString('fr-FR')} clients`, showLabel: this.filteredMapOutages().length <= 3 });
      marker.getElement().addEventListener('click', () => this.selectMapOutage(outage));
      this.publicMapMarkers.push(marker);
    }
    for (const incident of this.filteredMapIncidents()) {
      const marker = await addStegMarker(this.outageMap, [incident.longitude, incident.latitude], { tone: 'incident', label: `${this.incidentTypeLabel(incident.type)} · ${incident.zoneLabel}`, detail: `${incident.communityConfirmations} confirmation(s)`, showLabel: false });
      marker.getElement().addEventListener('click', () => this.selectMapIncident(incident));
      this.publicMapMarkers.push(marker);
    }
    this.outageHomeMarker?.setLngLat(this.homeCoordinates());
    if (this.mapReady()) this.centerOutageMap();
  }

  private homeCoordinates(): StegCoordinates {
    return [this.mapData()?.center?.longitude ?? 10.1764, this.mapData()?.center?.latitude ?? 36.8427];
  }
}
