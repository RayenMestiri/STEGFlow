import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StegApiService, SystemSetting } from 'shared-data-access';

type SettingValue = boolean | number | string | string[];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage implements OnInit {
  private readonly api = inject(StegApiService);

  protected readonly settings = signal<SystemSetting[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageError = signal('');
  protected readonly toast = signal('');
  protected readonly toastTitle = signal('');
  protected readonly settingsDraft = signal<Record<string, SettingValue>>({});

  protected readonly settingsGroups = computed(() =>
    [...new Set(this.settings().map((s) => s.group))],
  );

  ngOnInit(): void {
    this.loadData();
  }

  protected settingValue(key: string): SettingValue {
    return this.settingsDraft()[key] ?? '';
  }

  protected isBooleanSetting(setting: SystemSetting): boolean {
    return typeof setting.value === 'boolean';
  }

  protected isNumberSetting(setting: SystemSetting): boolean {
    return typeof setting.value === 'number';
  }

  protected setSettingValue(key: string, value: SettingValue): void {
    this.settingsDraft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected saveSettings(): void {
    const updates = this.settings().map((s) => {
      const value = this.settingsDraft()[s.key];
      return {
        key: s.key,
        ...(typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') }),
      };
    });
    this.saving.set(true);
    this.api.updateSystemSettings(updates).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.initDraft(settings);
        this.saving.set(false);
        this.showToast('Paramètres enregistrés', `${settings.length} règle(s) mises à jour.`);
      },
      error: () => { this.saving.set(false); this.showToast('Erreur', "Les paramètres n'ont pas pu être enregistrés."); },
    });
  }

  protected groupIcon(group: string): string {
    return ({ 'Sécurité': 'shield-check', 'Notifications': 'bell-ring', 'Confidentialité': 'eye-off' } as Record<string, string>)[group] ?? 'radio-tower';
  }

  protected loadData(): void {
    this.loading.set(true);
    this.api.getSystemSettings().subscribe({
      next: (settings) => { this.settings.set(settings); this.initDraft(settings); this.loading.set(false); },
      error: () => { this.loading.set(false); this.pageError.set('Impossible de charger les paramètres.'); },
    });
  }

  private initDraft(settings: SystemSetting[]): void {
    this.settingsDraft.set(Object.fromEntries(settings.map((s) => [s.key, s.value])));
  }

  private showToast(title: string, message: string): void {
    this.toastTitle.set(title);
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 4200);
  }
}
