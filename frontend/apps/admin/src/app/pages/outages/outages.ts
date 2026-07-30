import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminDashboard,
  Outage,
  StegApiService,
} from 'shared-data-access';

@Component({
  selector: 'app-outages',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './outages.html',
  styleUrl: './outages.scss',
})
export class OutagesPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly outages = signal<Outage[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('');

  protected readonly outageFilter = signal('all');
  protected readonly globalQuery = signal('');
  protected readonly selectedOutage = signal<Outage | null>(null);
  protected readonly createModalOpen = signal(false);
  protected readonly outageStep = signal(1);

  // Create form fields
  protected readonly selectedZone = signal('El Menzah 6');
  protected readonly selectedFeeder = signal('Départ A3-07');
  protected readonly outageReason = signal('Maintenance préventive');
  protected readonly outageStart = signal('2026-07-28T16:30');
  protected readonly outageDuration = signal('90');
  protected readonly outagePriority = signal('normal');
  protected readonly approvalRequired = signal(true);
  protected readonly notifyPush = signal(true);
  protected readonly notifySms = signal(true);
  protected readonly notifyEmail = signal(false);

  protected readonly filteredOutages = computed(() => {
    const query = this.globalQuery().trim().toLowerCase();
    return this.outages().filter(
      (o) =>
        (this.outageFilter() === 'all' || o.status === this.outageFilter()) &&
        (!query || `${o.reference} ${o.zoneLabel} ${o.reason} ${o.status}`.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.loadData();
  }

  protected openCreate(): void {
    this.outageStep.set(1);
    this.operationError.set('');
    this.createModalOpen.set(true);
  }

  protected closeCreate(): void {
    this.createModalOpen.set(false);
  }

  protected nextStep(): void {
    this.outageStep.update((s) => Math.min(s + 1, 5));
  }

  protected previousStep(): void {
    this.outageStep.update((s) => Math.max(s - 1, 1));
  }

  protected createOutage(): void {
    this.saving.set(true);
    this.operationError.set('');
    const zoneId = `zone-${this.selectedZone().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')}`;
    this.api.createOutage({
      zoneId,
      zoneLabel: this.selectedZone(),
      reason: this.outageReason(),
      startsAt: new Date(this.outageStart()).toISOString(),
      durationMinutes: Number(this.outageDuration()),
      supervisorApprovalRequired: this.approvalRequired(),
    }).subscribe({
      next: (outage) => {
        if (this.approvalRequired()) {
          this.finishCreation(outage, false);
        } else {
          this.api.publishOutage(outage.id).subscribe({
            next: () => this.finishCreation(outage, true),
            error: () => this.operationError.set('La publication a échoué.'),
          });
        }
      },
      error: () => { this.saving.set(false); this.operationError.set('La création a échoué. Vérifiez la connexion.'); },
    });
  }

  protected updateOutageStatus(outage: Outage, status: string): void {
    this.saving.set(true);
    this.api.updateOutageStatus(outage.id, status).subscribe({
      next: (updated) => {
        this.replaceOutage(updated);
        this.selectedOutage.set(updated);
        this.saving.set(false);
        this.showToast('Coupure mise à jour', `${updated.reference} → « ${this.statusLabel(status)} ».`);
        this.loadDashboard();
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', 'Impossible de modifier le statut.'); },
    });
  }

  protected publishExistingOutage(outage: Outage): void {
    this.saving.set(true);
    this.api.publishOutage(outage.id).subscribe({
      next: (updated) => {
        this.replaceOutage(updated);
        this.selectedOutage.set(updated);
        this.saving.set(false);
        this.showToast('Coupure publiée', `${updated.reference} est publiée.`);
        this.loadDashboard();
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', 'La publication a échoué.'); },
    });
  }

  protected statusLabel(status: string): string {
    return ({ draft: 'Brouillon', pending_approval: 'À valider', scheduled: 'Programmée', notified: 'Notifiée', active: 'En cours', restored: 'Rétablie', closed: 'Clôturée' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['active'].includes(status)) return 'danger';
    if (['pending_approval'].includes(status)) return 'warning';
    if (['scheduled', 'notified'].includes(status)) return 'info';
    if (['restored', 'closed'].includes(status)) return 'success';
    return 'neutral';
  }

  protected formatDate(value?: string | null, includeTime = true): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
  }

  protected formatTime(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
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
    this.api.getOutages().subscribe({
      next: (outages) => { this.outages.set(outages); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les coupures.'); },
    });
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.api.getAdminDashboard().subscribe((d) => this.dashboard.set(d));
  }

  private finishCreation(outage: Outage, published: boolean): void {
    this.saving.set(false);
    this.createModalOpen.set(false);
    this.outages.update((items) => [outage, ...items]);
    this.showToast(published ? 'Coupure publiée' : 'Validation demandée', published ? `${outage.reference} a été publiée.` : `${outage.reference} attend validation.`);
    this.loadDashboard();
  }

  private replaceOutage(updated: Outage): void {
    this.outages.update((items) => items.map((i) => (i.id === updated.id ? updated : i)));
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
