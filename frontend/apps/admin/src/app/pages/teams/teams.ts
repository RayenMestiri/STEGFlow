import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminDashboard,
  FieldTeam,
  StegApiService,
} from 'shared-data-access';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './teams.html',
  styleUrl: './teams.scss',
})
export class TeamsPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly teams = signal<FieldTeam[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('');

  protected readonly teamFilter = signal('all');
  protected readonly globalQuery = signal('');
  protected readonly selectedTeam = signal<FieldTeam | null>(null);

  protected readonly filteredTeams = computed(() => {
    const query = this.globalQuery().trim().toLowerCase();
    return this.teams().filter(
      (t) =>
        (this.teamFilter() === 'all' || t.status === this.teamFilter()) &&
        (!query || `${t.code} ${t.name} ${t.leadName} ${t.vehicle} ${t.base}`.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.loadData();
  }

  protected updateTeamStatus(team: FieldTeam, status: FieldTeam['status']): void {
    this.saving.set(true);
    this.api.updateTeamStatus(team.id, status).subscribe({
      next: (updated) => {
        this.teams.update((items) => items.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
        this.selectedTeam.set({ ...team, ...updated });
        this.saving.set(false);
        this.showToast('Disponibilité actualisée', `${updated.code} → « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', "Le statut n'a pas pu être enregistré."); },
    });
  }

  protected statusLabel(status: string): string {
    return ({ available: 'Disponible', on_mission: 'En mission', returning: 'Retour base', offline: 'Hors ligne' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['offline'].includes(status)) return 'danger';
    if (['returning'].includes(status)) return 'warning';
    if (['on_mission'].includes(status)) return 'info';
    if (['available'].includes(status)) return 'success';
    return 'neutral';
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
    this.api.getTeams().subscribe({
      next: (teams) => { this.teams.set(teams); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les équipes.'); },
    });
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.api.getAdminDashboard().subscribe((d) => this.dashboard.set(d));
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
