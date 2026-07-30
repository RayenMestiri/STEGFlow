import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, MaintenanceDashboard, StegApiService } from 'shared-data-access';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage implements OnInit {
  private readonly api = inject(StegApiService);
  protected readonly auth = inject(AuthService);

  protected readonly dashboard = signal<MaintenanceDashboard | null>(null);
  protected readonly loading = signal(false);

  protected get historyCount(): number {
    return this.dashboard()?.history?.length ?? 0;
  }

  protected get avgDuration(): number {
    const history = this.dashboard()?.history ?? [];
    if (!history.length) return 0;
    return Math.round(history.reduce((sum, item) => sum + item.durationMinutes, 0) / history.length);
  }

  ngOnInit(): void {
    this.loadData();
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getMaintenanceDashboard().subscribe({
      next: (dashboard) => { this.dashboard.set(dashboard); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }
}
