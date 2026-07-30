import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService, Login, StegApiService, CitizenDashboard } from 'shared-data-access';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, Login],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(StegApiService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  protected readonly dashboard = signal<CitizenDashboard | null>(null);
  protected readonly unreadNotifications = computed(() =>
    this.dashboard()?.notifications?.filter((n) => n.unread).length ?? 0
  );
  protected readonly notificationsOpen = signal(false);

  private updateSubscription?: Subscription;

  ngOnInit(): void {
    this.initializeAppUpdates();
    this.auth.initialize().subscribe({
      next: () => {
        if (this.auth.isAuthenticated()) {
          this.auth.requireRole(['citizen']).subscribe({
            next: () => this.api.getCitizenDashboard().subscribe((d) => this.dashboard.set(d)),
          });
        }
      },
    });
  }

  protected handleSignedIn(): void {
    this.auth.requireRole(['citizen']).subscribe({
      next: () => this.api.getCitizenDashboard().subscribe((d) => this.dashboard.set(d)),
    });
  }

  protected logout(): void {
    this.notificationsOpen.set(false);
    this.auth.logout().subscribe();
  }

  private initializeAppUpdates(): void {
    if (!this.swUpdate?.isEnabled) return;
    this.updateSubscription = this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        void this.swUpdate?.activateUpdate().then(() => window.location.reload()).catch(() => undefined);
      });
    void this.swUpdate.checkForUpdate().catch(() => undefined);
  }
}
