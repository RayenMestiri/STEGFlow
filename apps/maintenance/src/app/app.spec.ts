import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { icons, LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { AuthService, AuthUser, StegApiService } from 'shared-data-access';
import { App } from './app';

describe('App', () => {
  const user: AuthUser = { id: '3', email: 'technicien@steg.tn', firstName: 'Mehdi', lastName: 'K.', role: 'technician', contractNumber: null, address: null, teamCode: 'Équipe 12', phone: null, governorate: 'Tunis', delegation: 'El Menzah', district: null, latitude: null, longitude: null, lastLoginAt: null };
  const auth = {
    user: signal<AuthUser | null>(user),
    initialized: signal(true),
    isAuthenticated: signal(true),
    initialize: () => of(user),
    requireRole: () => of(user),
    logout: () => of(null),
  };
  const api = {
    getCurrentMission: () => of({ id: 'mission-1', reference: 'INT-2048', teamCode: 'Équipe 12', incidentId: 'incident-1', status: 'en_route', etaMinutes: 12, diagnosis: null }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, LucideAngularModule.pick(icons)],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: StegApiService, useValue: api },
      ],
    }).compileComponents();
  });

  it('should create and render the active mission', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('En déplacement');
  });
});
