import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminDashboard,
  NotificationCampaign,
  StegApiService,
} from 'shared-data-access';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class NotificationsPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly campaigns = signal<NotificationCampaign[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('');

  protected readonly notificationFilter = signal('all');
  protected readonly globalQuery = signal('');
  protected readonly composerOpen = signal(false);

  protected readonly notificationTitle = signal('Information réseau STEG');
  protected readonly notificationBody = signal('Une opération est en cours dans votre zone. Consultez STEGFlow pour suivre son évolution.');
  protected readonly notificationAudience = signal('Clients de la zone A3 · El Menzah 6');
  protected readonly notificationZone = signal('zone-el-menzah-6-a3');
  protected readonly notificationRecipients = signal(1842);
  protected readonly notificationPush = signal(true);
  protected readonly notificationSms = signal(true);
  protected readonly notificationEmail = signal(false);

  protected readonly filteredCampaigns = computed(() => {
    const query = this.globalQuery().trim().toLowerCase();
    return this.campaigns().filter(
      (c) =>
        (this.notificationFilter() === 'all' || c.status === this.notificationFilter()) &&
        (!query || `${c.reference} ${c.title} ${c.audienceLabel}`.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.loadData();
  }

  protected openComposer(): void {
    this.operationError.set('');
    this.composerOpen.set(true);
  }

  protected sendNotification(): void {
    const channels: Array<'push' | 'sms' | 'email'> = [];
    if (this.notificationPush()) channels.push('push');
    if (this.notificationSms()) channels.push('sms');
    if (this.notificationEmail()) channels.push('email');
    if (!channels.length) { this.operationError.set('Sélectionnez au moins un canal.'); return; }
    this.saving.set(true);
    this.operationError.set('');
    this.api.sendNotification({
      title: this.notificationTitle(),
      body: this.notificationBody(),
      audienceLabel: this.notificationAudience(),
      zoneId: this.notificationZone() || undefined,
      channels,
      recipients: Number(this.notificationRecipients()),
    }).subscribe({
      next: (campaign) => {
        this.campaigns.update((items) => [campaign, ...items]);
        this.composerOpen.set(false);
        this.saving.set(false);
        this.showToast('Campagne en file', `${campaign.reference} cible ${campaign.recipients.toLocaleString('fr-FR')} destinataires.`);
        window.setTimeout(() => this.loadData(), 800);
      },
      error: () => { this.saving.set(false); this.operationError.set("La campagne n'a pas pu être envoyée."); },
    });
  }

  protected retryNotification(campaign: NotificationCampaign): void {
    this.saving.set(true);
    this.api.retryNotification(campaign.id).subscribe({
      next: (retried) => {
        this.campaigns.update((items) => [retried, ...items]);
        this.saving.set(false);
        this.showToast('Relance programmée', `${Math.max(campaign.failed, 1)} message(s) remis en file.`);
        window.setTimeout(() => this.loadData(), 800);
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', 'La relance a échoué.'); },
    });
  }

  protected completionRate(campaign: NotificationCampaign): number {
    if (!campaign.recipients) return 0;
    return Math.round((campaign.delivered / campaign.recipients) * 100);
  }

  protected statusLabel(status: string): string {
    return ({ queued: 'En file', sending: 'Envoi en cours', delivered: 'Livrée', partial: 'Partielle', failed: 'Échec' } as Record<string, string>)[status] ?? status;
  }

  protected statusTone(status: string): string {
    if (['failed'].includes(status)) return 'danger';
    if (['partial', 'queued'].includes(status)) return 'warning';
    if (['sending'].includes(status)) return 'info';
    if (['delivered'].includes(status)) return 'success';
    return 'neutral';
  }

  protected formatDate(value?: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getNotificationCampaigns().subscribe({
      next: (campaigns) => { this.campaigns.set(campaigns); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les notifications.'); },
    });
    this.api.getAdminDashboard().subscribe((d) => this.dashboard.set(d));
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
