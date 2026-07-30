import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuditEntry, StegApiService } from 'shared-data-access';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './audit.html',
  styleUrl: './audit.scss',
})
export class AuditPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly auditEntries = signal<AuditEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly pageError = signal('');
  protected readonly auditFilter = signal('all');
  protected readonly globalQuery = signal('');
  protected readonly toast = signal('');

  protected readonly auditCategories = computed(() =>
    [...new Set(this.auditEntries().map((e) => e.category))].sort(),
  );

  protected readonly filteredAudit = computed(() => {
    const query = this.globalQuery().trim().toLowerCase();
    return this.auditEntries().filter(
      (e) =>
        (this.auditFilter() === 'all' || e.category === this.auditFilter()) &&
        (!query || `${e.title} ${e.details ?? ''} ${e.actorName} ${e.category}`.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.loadData();
  }

  protected exportAudit(): void {
    const header = ['Date', 'Catégorie', 'Action', 'Acteur', 'Détails'];
    const rows = this.filteredAudit().map((e) => [new Date(e.createdAt).toLocaleString('fr-TN'), e.category, e.title, e.actorName, e.details ?? '']);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stegflow-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.toast.set('Export CSV prêt.');
    window.setTimeout(() => this.toast.set(''), 4200);
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
    this.api.getAuditLog().subscribe({
      next: (entries) => { this.auditEntries.set(entries); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set("Impossible de charger le journal d'audit."); },
    });
  }
}
