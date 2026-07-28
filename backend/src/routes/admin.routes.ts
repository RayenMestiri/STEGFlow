import { Router } from 'express';
import { z } from 'zod';
import {
  FIELD_TEAM_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  NOTIFICATION_CHANNELS,
  OUTAGE_STATUSES,
} from '../domain/constants.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  assignIncident,
  getAdminDashboard,
  getAuditLog,
  getNotificationCampaigns,
  getSystemSettings,
  getTeams,
  retryNotification,
  sendNotification,
  updateIncident,
  updateOutageStatus,
  updateSystemSettings,
  updateTeam,
} from '../services/admin.service.js';

const outageStatusSchema = z.object({ status: z.enum(OUTAGE_STATUSES) });
const incidentUpdateSchema = z
  .object({
    status: z.enum(INCIDENT_STATUSES).optional(),
    severity: z.enum(INCIDENT_SEVERITIES).optional(),
  })
  .refine((value) => value.status || value.severity, {
    message: 'Un statut ou une priorité est requis.',
  });
const teamSchema = z.object({ status: z.enum(FIELD_TEAM_STATUSES) });
const assignSchema = z.object({ teamId: z.uuid() });
const notificationSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(3).max(1_500),
  audienceLabel: z.string().trim().min(2).max(180),
  zoneId: z.string().trim().max(120).optional(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3),
  recipients: z.coerce.number().int().min(1).max(1_000_000),
});
const settingSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().trim().min(2),
        booleanValue: z.boolean().optional(),
        stringValue: z.string().optional(),
        numberValue: z.number().optional(),
        objectValue: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1),
});

export const adminRouter = Router();
adminRouter.use(
  requireAuth,
  requireRoles('admin', 'supervisor', 'dispatcher'),
);

adminRouter.get('/dashboard', async (_request, response) => {
  response.json(await getAdminDashboard());
});

adminRouter.get('/teams', async (_request, response) => {
  response.json(await getTeams());
});

adminRouter.patch(
  '/teams/:id',
  validateBody(teamSchema),
  async (request, response) => {
    response.json(
      await updateTeam(String(request.params.id), request.body.status, request.user!),
    );
  },
);

adminRouter.patch(
  '/outages/:id/status',
  validateBody(outageStatusSchema),
  async (request, response) => {
    response.json(
      await updateOutageStatus(
        String(request.params.id),
        request.body.status,
        request.user!,
      ),
    );
  },
);

adminRouter.patch(
  '/incidents/:id',
  validateBody(incidentUpdateSchema),
  async (request, response) => {
    response.json(
      await updateIncident(String(request.params.id), request.body, request.user!),
    );
  },
);

adminRouter.post(
  '/incidents/:id/assign',
  validateBody(assignSchema),
  async (request, response) => {
    response.status(201).json(
      await assignIncident(
        String(request.params.id),
        request.body.teamId,
        request.user!,
      ),
    );
  },
);

adminRouter.get('/notifications', async (_request, response) => {
  response.json(await getNotificationCampaigns());
});

adminRouter.post(
  '/notifications',
  validateBody(notificationSchema),
  async (request, response) => {
    response
      .status(201)
      .json(await sendNotification(request.body, request.user!));
  },
);

adminRouter.post('/notifications/:id/retry', async (request, response) => {
  response
    .status(201)
    .json(await retryNotification(String(request.params.id), request.user!));
});

adminRouter.get(
  '/audit',
  requireRoles('admin', 'supervisor'),
  async (_request, response) => {
    response.json(await getAuditLog());
  },
);

adminRouter.get(
  '/settings',
  requireRoles('admin', 'supervisor'),
  async (_request, response) => {
    response.json(await getSystemSettings());
  },
);

adminRouter.patch(
  '/settings',
  requireRoles('admin', 'supervisor'),
  validateBody(settingSchema),
  async (request, response) => {
    response.json(
      await updateSystemSettings(request.body.settings, request.user!),
    );
  },
);
