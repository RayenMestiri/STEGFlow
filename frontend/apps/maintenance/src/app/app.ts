import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService, Login, MaintenanceDashboard, StegApiService } from 'shared-data-access';

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

  protected readonly dashboard = signal<MaintenanceDashboard | null>(null);
  protected readonly online = signal(navigator.onLine);
  protected readonly gpsActive = signal(false);
  protected readonly notificationsOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  private updateSubscription?: Subscription;

  ngOnInit(): void {
    this.initializeAppUpdates();
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    this.auth.initialize().subscribe({
      next: () => {
        if (this.auth.isAuthenticated()) {
          this.auth.requireRole(['technician']).subscribe({
            next: () => this.api.getMaintenanceDashboard().subscribe((d) => this.dashboard.set(d)),
          });
        }
      },
    });
  }

  protected handleSignedIn(): void {
    this.auth.requireRole(['technician']).subscribe({
      next: () => this.api.getMaintenanceDashboard().subscribe((d) => this.dashboard.set(d)),
    });
  }

  protected logout(): void {
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
