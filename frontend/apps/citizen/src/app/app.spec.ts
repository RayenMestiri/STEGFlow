import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { AuthService, AuthUser, StegApiService } from 'shared-data-access';
import { App } from './app';
import { citizenIcons } from './app.config';

describe('App', () => {
  const user: AuthUser = { id: '2', email: 'citoyen@steg.tn', firstName: 'Mohamed', lastName: 'Ben Salem', role: 'citizen', contractNumber: 'STEG-8042', address: 'El Menzah 6', teamCode: null, phone: '+21620123456', governorate: 'Tunis', delegation: 'El Menzah', district: 'El Menzah 6', latitude: 36.8427, longitude: 10.1764, lastLoginAt: null };
  const auth = {
    user: signal<AuthUser | null>(user),
    initialized: signal(true),
    isAuthenticated: signal(true),
    initialize: () => of(user),
    requireRole: () => of(user),
    logout: () => of(null),
  };

  beforeEach(async () => {
    const dashboard = {
      generatedAt: new Date().toISOString(),
      profile: {
        firstName: 'Mohamed',
        contractNumber: 'STEG-8042',
        address: 'El Menzah 6',
        district: 'El Menzah 6',
        governorate: 'Tunis',
        latitude: 36.8427,
        longitude: 10.1764,
      },
      situation: {
        state: 'intervention_in_progress',
        zoneId: 'zone-el-menzah-6-a3',
        zoneLabel: 'El Menzah 6',
        cause: 'Diagnostic en cours',
        affectedCustomers: 1842,
        communityConfirmations: 23,
        estimatedRestorationAt: new Date(Date.now() + 3600000).toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        powerRestoredConfirmedAt: null,
      },
      currentOutage: null,
      mission: {
        id: 'mission-1',
        reference: 'INT-2048',
        teamCode: 'Équipe 12',
        status: 'en_route',
        etaMinutes: 12,
        diagnosis: null,
        lastPositionAt: new Date().toISOString(),
        approximatePosition: { latitude: 36.843, longitude: 10.176 },
      },
      timeline: [
        { key: 'reported', label: 'Signalement reçu', state: 'completed', at: new Date().toISOString() },
        { key: 'en_route', label: 'En déplacement', state: 'current', at: new Date().toISOString() },
      ],
      upcomingOutages: [],
      myReports: [],
      notifications: [],
    };
    await TestBed.configureTestingModule({
      imports: [App, LucideAngularModule.pick(citizenIcons)],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: StegApiService,
          useValue: {
            getCitizenDashboard: () => of(dashboard),
            getCitizenMap: () =>
              of({
                generatedAt: new Date().toISOString(),
                center: { latitude: 36.8427, longitude: 10.1764 },
                outages: [],
                incidents: [],
              }),
            getCitizenSafety: () =>
              of({
                generatedAt: new Date().toISOString(),
                emergency: {
                  label: 'Urgence STEG',
                  phone: '80100444',
                  displayPhone: '80 100 444',
                  description: 'Urgence',
                },
                service: {
                  label: 'Services',
                  phone: '71239222',
                  displayPhone: '71 239 222',
                  description: 'Services',
                },
                guides: [],
                faqs: [],
                officialSource: 'https://www.steg.com.tn',
              }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create and render the citizen tracking view', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Une équipe intervient');
  });

  it('should navigate to the map and safety dashboards', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('header nav button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Carte'))?.click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Carte des coupures');
    buttons.find((button) => button.textContent?.includes('sécurité'))?.click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Aide & sécurité');
  });
});
