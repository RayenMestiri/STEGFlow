import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminDashboard,
  FieldTeam,
  Incident,
  StegApiService,
} from 'shared-data-access';

@Component({
  selector: 'app-incidents',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './incidents.html',
  styleUrl: './incidents.scss',
})
export class IncidentsPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly incidentRecords = signal<Incident[]>([]);
  protected readonly teams = signal<FieldTeam[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('');

  protected readonly incidentFilter = signal('all');
  protected readonly globalQuery = signal('');
  protected readonly selectedIncident = signal<Incident | null>(null);
  protected readonly assignmentTeamId = signal('');

  protected readonly filteredIncidents = computed(() => {
    const query = this.globalQuery().trim().toLowerCase();
    return this.incidentRecords().filter(
      (i) =>
        (this.incidentFilter() === 'all' || i.severity === this.incidentFilter()) &&
        (!query || `${i.reference} ${this.incidentTypeLabel(i.type)} ${i.address} ${i.status}`.toLowerCase().includes(query)),
    );
  });

  protected readonly availableTeams = computed(() =>
    this.teams().filter((t) => t.status === 'available'),
  );

  ngOnInit(): void {
    this.loadData();
  }

  protected updateIncidentStatus(incident: Incident, status: string): void {
    this.saving.set(true);
    this.api.updateIncident(incident.id, { status }).subscribe({
      next: (updated) => {
        this.replaceIncident(updated);
        this.selectedIncident.set(updated);
        this.saving.set(false);
        this.showToast('Signalement mis à jour', `${updated.reference} → « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', 'Impossible de modifier ce signalement.'); },
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
        this.showToast('Équipe affectée', `${mission.teamCode} → mission ${mission.reference}.`);
        this.loadDashboard();
        this.api.getTeams().subscribe((teams) => this.teams.set(teams));
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', "L'affectation a échoué."); },
    });
  }

  protected incidentTypeLabel(type: string): string {
    return ({ outage: 'Coupure non déclarée', voltage: 'Tension instable', fire: 'Incendie', wire: 'Câble dangereux', meter: 'Compteur endommagé', other: 'Autre' } as Record<string, string>)[type] ?? type;
  }

  protected statusLabel(status: string): string {
    return ({ reported: 'Reçu', verified: 'Vérifié', dispatched: 'Équipe affectée', in_progress: 'Traitement en cours', resolved: 'Résolu', rejected: 'Rejeté' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['in_progress', 'critical', 'failed', 'rejected'].includes(status)) return 'danger';
    if (['reported', 'high', 'partial'].includes(status)) return 'warning';
    if (['verified', 'dispatched'].includes(status)) return 'info';
    if (['resolved'].includes(status)) return 'success';
    return 'neutral';
  }

  protected formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected relativeTime(value?: string | null): string {
    if (!value) return 'Jamais';
    const minutes = Math.max(0, Math.round((Date.now() - +new Date(value)) / 60_000));
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    return `Il y a ${Math.floor(minutes / 60)} h`;
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getIncidents().subscribe({
      next: (incidents) => { this.incidentRecords.set(incidents); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les signalements.'); },
    });
    this.api.getTeams().subscribe((teams) => this.teams.set(teams));
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.api.getAdminDashboard().subscribe((d) => this.dashboard.set(d));
  }

  private replaceIncident(updated: Incident): void {
    this.incidentRecords.update((items) => items.map((i) => (i.id === updated.id ? updated : i)));
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
