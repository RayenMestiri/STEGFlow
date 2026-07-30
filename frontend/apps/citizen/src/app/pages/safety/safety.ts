import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CitizenSafety, CitizenSafetyGuide, StegApiService } from 'shared-data-access';

@Component({
  selector: 'app-safety',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './safety.html',
  styleUrl: './safety.scss',
})
export class SafetyPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly safety = signal<CitizenSafety | null>(null);
  protected readonly loading = signal(false);
  protected readonly pageError = signal('');
  protected readonly expandedFaq = signal<string | null>('planned');
  protected readonly selectedGuide = signal<CitizenSafetyGuide | null>(null);

  ngOnInit(): void {
    this.loadData();
  }

  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }

  protected openGuide(guide: CitizenSafetyGuide): void {
    this.selectedGuide.set(guide);
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getCitizenSafety().subscribe({
      next: (safety) => { this.safety.set(safety); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les consignes de sécurité.'); },
    });
  }
}
