import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  MaintenanceDashboard,
  StegApiService,
  UpdateMaintenanceReport,
} from 'shared-data-access';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './report.html',
  styleUrl: './report.scss',
})
export class ReportPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly dashboard = signal<MaintenanceDashboard | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly photoUploading = signal(false);
  protected readonly pageError = signal('');
  protected readonly operationError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('Rapport enregistré');

  protected readonly diagnosis = signal('');
  protected readonly estimate = signal('45');
  protected readonly note = signal('');
  protected readonly requestedResources = signal<string[]>([]);

  protected readonly availableResources = [
    'Câble THT 10 m', 'Compteur mono B.T.', 'Compteur tri B.T.',
    'Fusibles HTA 3 A', 'Transformateur 250 kVA', 'Armoire TURPE',
  ];

  protected readonly reportCompletion = computed(() => {
    let score = 0;
    if (this.diagnosis()) score += 40;
    if (this.note()) score += 30;
    if (this.requestedResources().length > 0) score += 30;
    return score;
  });

  protected readonly photoUrls = signal<string[]>([]);

  ngOnInit(): void {
    this.loadData();
  }

  protected toggleResource(resource: string): void {
    this.requestedResources.update((current) =>
      current.includes(resource) ? current.filter((r) => r !== resource) : [...current, resource],
    );
  }

  protected onPhotoSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 5 - this.photoUrls().length);
    if (!files.length) return;
    this.photoUploading.set(true);
    let remaining = files.length;
    files.forEach((file) => {
      this.api.uploadPhoto(file).subscribe({
        next: ({ url }) => {
          this.photoUrls.update((p) => [...p, url].slice(0, 5));
          remaining -= 1;
          if (!remaining) this.photoUploading.set(false);
        },
        error: () => { remaining -= 1; this.photoUploading.set(false); this.operationError.set("Une photo n'a pas pu être envoyée."); },
      });
    });
  }

  protected removePhoto(photo: string): void {
    this.photoUrls.update((p) => p.filter((item) => item !== photo));
  }

  protected saveReport(): void {
    const mission = this.dashboard()?.activeMission;
    if (!mission) { this.operationError.set('Aucune mission active.'); return; }
    if (!this.diagnosis()) { this.operationError.set('Le diagnostic est requis.'); return; }
    this.saving.set(true);
    this.operationError.set('');
    const update: UpdateMaintenanceReport = {
      diagnosis: this.diagnosis(),
      estimatedRepairMinutes: Number(this.estimate()),
      notes: this.note() || undefined,
      requestedResources: this.requestedResources(),
    };
    this.api.updateMissionReport(mission.id, update).subscribe({
      next: () => {
        // also sync photos if any
        if (this.photoUrls().length) {
          this.api.addMissionPhotos(mission.id, this.photoUrls()).subscribe();
        }
        this.saving.set(false);
        this.showToast('Rapport enregistré', 'Les informations ont été transmises au centre.');
      },
      error: () => { this.saving.set(false); this.operationError.set('Le rapport n\'a pas pu être enregistré.'); },
    });
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getMaintenanceDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
        const mission = dashboard.activeMission;
        if (mission) {
          if (mission.diagnosis) this.diagnosis.set(mission.diagnosis);
          if (mission.reportNotes) this.note.set(mission.reportNotes);
          if (mission.estimatedRepairMinutes) this.estimate.set(String(mission.estimatedRepairMinutes));
          if (mission.requestedResources?.length) this.requestedResources.set(mission.requestedResources);
          if (mission.photoUrls?.length) this.photoUrls.set(mission.photoUrls);
        }
      },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les données de la mission.'); },
    });
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
