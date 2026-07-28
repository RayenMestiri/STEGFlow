import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import {
  AuthService,
  AuthUser,
  MaintenanceDashboard,
  StegApiService,
} from 'shared-data-access';
import { vi } from 'vitest';
import { App } from './app';
import { maintenanceIcons } from './app.config';

describe('Maintenance App', () => {
  const user: AuthUser = {
    id: '3',
    email: 'technicien@steg.tn',
    firstName: 'Mehdi',
    lastName: 'Khelifi',
    role: 'technician',
    contractNumber: null,
    address: null,
    teamCode: 'Équipe 12',
    phone: '+216 71 000 012',
    governorate: 'Tunis',
    delegation: 'El Menzah',
    district: null,
    latitude: null,
    longitude: null,
    lastLoginAt: null,
  };

  const dashboard: MaintenanceDashboard = {
    generatedAt: '2026-07-28T14:32:00.000Z',
    team: {
      id: 'team-12',
      code: 'Équipe 12',
      name: 'Unité intervention Tunis Nord',
      leadName: 'Mehdi Khelifi',
      phone: '+216 71 000 012',
      vehicle: 'STEG 12-204',
      status: 'on_mission',
      members: 3,
      base: 'Tunis Nord',
      skills: ['BT', 'MT', 'Travaux sous tension'],
      lastSeenAt: '2026-07-28T14:31:00.000Z',
    },
    activeMission: {
      id: 'mission-1',
      reference: 'INT-2048',
      teamCode: 'Équipe 12',
      incidentId: 'incident-1',
      status: 'en_route',
      etaMinutes: 12,
      diagnosis: null,
      estimatedRepairMinutes: 45,
      reportNotes: null,
      photoUrls: [],
      requestedResources: [],
      statusHistory: [
        {
          status: 'assigned',
          at: '2026-07-28T14:10:00.000Z',
          source: 'Centre STEG',
        },
        {
          status: 'en_route',
          at: '2026-07-28T14:20:00.000Z',
          source: 'Équipe 12',
        },
      ],
      emergencyEvents: [],
      distanceKm: 6.4,
      elapsedMinutes: 22,
      createdAt: '2026-07-28T14:10:00.000Z',
      lastPositionAt: '2026-07-28T14:31:00.000Z',
      lastPosition: {
        type: 'Point',
        coordinates: [10.1764, 36.8427],
      },
      incident: {
        id: 'incident-1',
        reference: 'SIG-2841',
        type: 'outage',
        description: 'Plusieurs immeubles sans courant.',
        address: '14, Rue des Orangers, El Menzah 6',
        severity: 'high',
        status: 'in_progress',
        photos: [],
        communityConfirmations: 23,
        location: {
          type: 'Point',
          coordinates: [10.1855, 36.8375],
        },
        activity: [],
        createdAt: '2026-07-28T14:02:00.000Z',
      },
      contact: {
        name: 'Mohamed Ben Salem',
        initials: 'MB',
        phone: '+216 22 000 000',
        contractNumber: '8042',
        contractMasked: '•••• 8042',
        address: '14, Rue des Orangers, El Menzah 6',
      },
    },
    history: [
      {
        id: 'mission-old',
        reference: 'INT-2012',
        incidentReference: 'SIG-2798',
        incidentType: 'voltage',
        address: 'Mutuelleville, Tunis',
        severity: 'medium',
        status: 'closed',
        diagnosis: 'Fusible moyenne tension',
        photoCount: 4,
        createdAt: '2026-07-25T10:00:00.000Z',
        completedAt: '2026-07-25T11:20:00.000Z',
        durationMinutes: 80,
      },
    ],
    notifications: [
      {
        id: 'notification-1',
        type: 'mission',
        title: 'Mission actualisée',
        body: 'L’incident SIG-2841 est confirmé.',
        createdAt: '2026-07-28T14:30:00.000Z',
        unread: true,
      },
    ],
  };

  const auth = {
    user: signal<AuthUser | null>(user),
    initialized: signal(true),
    isAuthenticated: signal(true),
    initialize: () => of(user),
    requireRole: () => of(user),
    logout: () => of(null),
  };

  const api = {
    getMaintenanceDashboard: vi.fn(() => of(dashboard)),
    updateMissionStatus: vi.fn(() => of({})),
    updateMissionReport: vi.fn(() => of({})),
    updateMissionPosition: vi.fn(() => of({})),
    uploadPhoto: vi.fn(() => of({ url: '/uploads/proof.jpg' })),
    addMissionPhotos: vi.fn(() => of({})),
    createMissionEmergency: vi.fn(() =>
      of({ message: 'Alerte transmise au centre.' }),
    ),
  };

  beforeEach(async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    await TestBed.configureTestingModule({
      imports: [App, LucideAngularModule.pick(maintenanceIcons)],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: StegApiService, useValue: api },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the mission with live API information', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('En déplacement');
    expect(element.textContent).toContain('14, Rue des Orangers');
    expect(element.textContent).toContain('INT-2048');
    fixture.destroy();
  });

  it('navigates to report, history and team views', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const clickNav = (label: string) => {
      const button = Array.from(
        element.querySelectorAll<HTMLButtonElement>('.desktop-nav button'),
      ).find((item) => item.textContent?.includes(label));
      button?.click();
      fixture.detectChanges();
    };

    clickNav('Rapport');
    expect(element.querySelector('.page-heading h1')?.textContent).toContain(
      'Rapport',
    );
    clickNav('Historique');
    expect(element.querySelector('.page-heading h1')?.textContent).toContain(
      'Historique',
    );
    clickNav('Équipe');
    expect(element.querySelector('.team-hero h1')?.textContent).toContain(
      'Unité intervention Tunis Nord',
    );
    fixture.destroy();
  });
});
