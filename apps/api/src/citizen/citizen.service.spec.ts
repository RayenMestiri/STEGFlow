import { CitizenService } from './citizen.service';

describe('CitizenService', () => {
  const user = {
    id: 'citizen-new',
    email: 'new@example.tn',
    firstName: 'Nadia',
    lastName: 'Trabelsi',
    role: 'citizen',
    contractNumber: null,
    address: null,
    teamCode: null,
    phone: null,
    governorate: null,
    delegation: null,
    district: null,
    latitude: null,
    longitude: null,
    lastLoginAt: null,
  } as any;

  function createService(options?: {
    incidents?: any[];
    missions?: any[];
  }) {
    const outages = {
      find: jest.fn().mockResolvedValue([]),
    };
    const incidents = {
      find: jest.fn().mockResolvedValue(options?.incidents ?? []),
    };
    const missions = {
      find: jest.fn().mockResolvedValue(options?.missions ?? []),
    };
    const confirmations = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    return new CitizenService(
      outages as any,
      incidents as any,
      missions as any,
      confirmations as any,
    );
  }

  it('does not expose an unrelated active mission to a new account', async () => {
    const incident = {
      id: 'incident-other',
      address: 'La Marsa',
      reportedByUserId: 'another-user',
      contractNumber: null,
      status: 'in_progress',
      communityConfirmations: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const service = createService({
      incidents: [incident],
      missions: [
        {
          id: 'mission-other',
          incidentId: incident.id,
          status: 'en_route',
          updatedAt: new Date(),
        },
      ],
    });

    const dashboard = await service.getDashboard(user);

    expect(dashboard.mission).toBeNull();
    expect(dashboard.timeline).toEqual([]);
    expect(dashboard.myReports).toEqual([]);
    expect(dashboard.situation.state).toBe('normal');
    expect(dashboard.situation.affectedCustomers).toBe(0);
    expect(dashboard.situation.estimatedRestorationAt).toBeNull();
  });

  it('shows the mission attached to a report created by the citizen', async () => {
    const now = new Date();
    const incident = {
      id: 'incident-owned',
      reference: 'INC-OWNED',
      type: 'outage',
      description: 'Coupure dans le logement.',
      address: 'Tunis',
      severity: 'medium',
      status: 'in_progress',
      photos: [],
      reportedByUserId: user.id,
      contractNumber: null,
      assignedTeamCode: 'Équipe 12',
      communityConfirmations: 1,
      createdAt: now,
      updatedAt: now,
    };
    const mission = {
      id: 'mission-owned',
      reference: 'INT-OWNED',
      incidentId: incident.id,
      teamCode: 'Équipe 12',
      status: 'en_route',
      etaMinutes: 15,
      diagnosis: null,
      lastPosition: null,
      lastPositionAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const service = createService({
      incidents: [incident],
      missions: [mission],
    });

    const dashboard = await service.getDashboard(user);

    expect(dashboard.mission?.id).toBe(mission.id);
    expect(dashboard.timeline).toHaveLength(8);
    expect(dashboard.myReports).toHaveLength(1);
    expect(dashboard.situation.state).toBe('intervention_in_progress');
  });
});
