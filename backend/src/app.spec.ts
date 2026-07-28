import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { seedDatabase } from './db/seed.js';
import { AuthEvent, User } from './models/index.js';
import { closeNotificationInfrastructure } from './services/notifications.service.js';

const app = createApp();
const email = `qa.mean.${Date.now()}@steg-demo.tn`;
let citizenToken = '';

beforeAll(async () => {
  await connectDatabase();
  await seedDatabase();
});

afterAll(async () => {
  const user = await User.findOne({ email });
  if (user) {
    await AuthEvent.deleteMany({ userId: String(user._id) });
    await user.deleteOne();
  }
  await closeNotificationInfrastructure();
  await disconnectDatabase();
});

describe('STEGFlow MEAN API', () => {
  it('expose MongoDB as the active database', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body.stack).toBe('MEAN');
    expect(response.body.database).toEqual({
      engine: 'MongoDB',
      status: 'connected',
    });
  });

  it('keeps a fresh citizen account free of unrelated interventions', async () => {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Nour',
        lastName: 'Khelifi',
        email,
        password: 'Volt!Grid2026#',
        acceptTerms: true,
      })
      .expect(201);
    citizenToken = registration.body.accessToken;

    const response = await request(app)
      .get('/api/v1/citizen/dashboard')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);

    expect(response.body.situation.state).toBe('normal');
    expect(response.body.situation.affectedCustomers).toBe(0);
    expect(response.body.situation.estimatedRestorationAt).toBeNull();
    expect(response.body.mission).toBeNull();
    expect(response.body.timeline).toEqual([]);
    expect(response.body.myReports).toEqual([]);
  });

  it('serves the admin and maintenance dashboards from MongoDB', async () => {
    const admin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'superviseur@steg.tn', password: 'Admin2026!' })
      .expect(200);
    const maintenance = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technicien@steg.tn', password: 'Tech2026!' })
      .expect(200);

    const [adminDashboard, fieldDashboard] = await Promise.all([
      request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${admin.body.accessToken}`),
      request(app)
        .get('/api/v1/missions/me/dashboard')
        .set('Authorization', `Bearer ${maintenance.body.accessToken}`),
    ]);

    expect(adminDashboard.status).toBe(200);
    expect(adminDashboard.body.teams.total).toBeGreaterThan(0);
    expect(fieldDashboard.status).toBe(200);
    expect(fieldDashboard.body.team.code).toBe('Équipe 12');
    expect(fieldDashboard.body.activeMission?.incident?.id).toBeTruthy();
  });
});
