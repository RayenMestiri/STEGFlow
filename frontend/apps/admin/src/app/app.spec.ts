import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { icons, LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { AuthService, AuthUser, StegApiService } from 'shared-data-access';
import { App } from './app';

describe('App', () => {
  const user: AuthUser = { id: '1', email: 'superviseur@steg.tn', firstName: 'Amine', lastName: 'Khelifi', role: 'supervisor', contractNumber: null, address: null, teamCode: null, phone: null, governorate: 'Tunis', delegation: 'Cité El Khadra', district: null, latitude: null, longitude: null, lastLoginAt: null };
  const auth = {
    user: signal<AuthUser | null>(user),
    initialized: signal(true),
    isAuthenticated: signal(true),
    initialize: () => of(user),
    requireRole: () => of(user),
    logout: () => of(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, LucideAngularModule.pick(icons)],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: StegApiService,
          useValue: {
            getAdminDashboard: () =>
              of({
                generatedAt: new Date().toISOString(),
                networkAvailability: 97.8,
                monthlyTarget: 98.5,
                outages: {
                  total: 2,
                  active: 0,
                  scheduled: 1,
                  pendingApproval: 1,
                  affectedCustomers: 4152,
                },
                incidents: { total: 1, open: 1, critical: 1 },
                teams: { total: 4, available: 2, onMission: 1, connected: 4 },
                missions: { active: 1 },
                notifications: {
                  campaigns: 2,
                  recipients: 2466,
                  delivered: 2427,
                  failed: 39,
                  deliveryRate: 98.4,
                },
              }),
            getOutages: () => of([]),
            getOperationsTracking: () => of([]),
            getIncidents: () => of([]),
            getTeams: () => of([]),
            getNotificationCampaigns: () => of([]),
            getAuditLog: () => of([]),
            getSystemSettings: () => of([]),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create and render the operations dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Bonjour Amine');
  });

  it('should navigate to all operations sections', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const notifications = Array.from(host.querySelectorAll<HTMLButtonElement>('.nav-item')).find(
      (button) => button.textContent?.includes('Notifications'),
    );
    notifications?.click();
    fixture.detectChanges();
    expect(host.querySelector('.page-heading h1')?.textContent).toContain('Notifications');
  });
});
