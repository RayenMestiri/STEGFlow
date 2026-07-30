import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MaintenanceHistoryItem, StegApiService } from 'shared-data-access';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly historyItems = signal<MaintenanceHistoryItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly pageError = signal('');
  protected readonly historySearch = signal('');
  protected readonly selectedHistory = signal<MaintenanceHistoryItem | null>(null);

  protected readonly filteredHistory = computed(() => {
    const query = this.historySearch().trim().toLowerCase();
    return this.historyItems().filter(
      (item) => !query || `${item.reference} ${item.incidentType} ${item.address}`.toLowerCase().includes(query),
    );
  });

  ngOnInit(): void {
    this.loadData();
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

  protected severityLabel(severity: string): string {
    return ({ low: 'Faible', medium: 'Modérée', high: 'Élevée', critical: 'Critique' } as Record<string, string>)[severity] ?? severity;
  }

  protected statusLabel(status: string): string {
    return ({ resolved: 'Résolu', closed: 'Clôturé', testing: 'Tests', repairing: 'Réparation' } as Record<string, string>)[status] ?? status;
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getMaintenanceHistory().subscribe({
      next: (items) => { this.historyItems.set(items); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set("Impossible de charger l'historique."); },
    });
  }
}
