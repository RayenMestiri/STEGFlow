import { Router } from 'express';
import { z } from 'zod';
import { MISSION_STATUSES } from '../domain/constants.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  addMissionPhotos,
  assertMissionTransition,
  createMissionEmergency,
  findCitizenTracking,
  findCurrentMission,
  findMaintenanceDashboard,
  findMission,
  findMissionHistory,
  findOperationsTracking,
  updateMissionPosition,
  updateMissionReport,
  updateMissionStatus,
} from '../services/missions.service.js';

const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const statusSchema = z.object({
  status: z.enum(MISSION_STATUSES),
  diagnosis: z.string().trim().max(4_000).optional(),
});
const reportSchema = z.object({
  diagnosis: z.string().trim().max(4_000).optional(),
  estimatedRepairMinutes: z.coerce.number().int().min(5).max(720).optional(),
  notes: z.string().trim().max(8_000).optional(),
  requestedResources: z.array(z.string().trim().min(1)).max(12).optional(),
});
const photosSchema = z.object({
  urls: z.array(z.url()).min(1).max(12),
});
const emergencySchema = z.object({
  type: z.enum(['accident', 'electrical', 'security']),
  note: z.string().trim().max(1_000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const missionsRouter = Router();
missionsRouter.use(requireAuth);

missionsRouter.get(
  '/tracking/current',
  requireRoles('citizen', 'admin', 'supervisor'),
  async (request, response) => {
    response.json(await findCitizenTracking(request.user!));
  },
);

missionsRouter.get(
  '/tracking/operations',
  requireRoles('admin', 'supervisor', 'dispatcher'),
  async (_request, response) => {
    response.json(await findOperationsTracking());
  },
);

missionsRouter.get(
  '/me/dashboard',
  requireRoles('technician', 'admin', 'supervisor', 'dispatcher'),
  async (request, response) => {
    response.json(await findMaintenanceDashboard(request.user!));
  },
);

missionsRouter.get(
  '/me/history',
  requireRoles('technician', 'admin', 'supervisor', 'dispatcher'),
  async (request, response) => {
    response.json(
      await findMissionHistory(request.user!.teamCode ?? 'Équipe 12'),
    );
  },
);

missionsRouter.get(
  '/current/me',
  requireRoles('technician', 'admin', 'supervisor', 'dispatcher'),
  async (request, response) => {
    response.json(
      await findCurrentMission(request.user!.teamCode ?? 'Équipe 12'),
    );
  },
);

missionsRouter.get(
  '/:id',
  requireRoles('technician', 'admin', 'supervisor', 'dispatcher'),
  async (request, response) => {
    response.json(await findMission(String(request.params.id)));
  },
);

missionsRouter.post(
  '/:id/position',
  requireRoles('technician'),
  validateBody(positionSchema),
  async (request, response) => {
    response.json(
      await updateMissionPosition(String(request.params.id), request.body),
    );
  },
);

missionsRouter.patch(
  '/:id/status',
  requireRoles('technician'),
  validateBody(statusSchema),
  async (request, response) => {
    const mission = await findMission(String(request.params.id));
    assertMissionTransition(mission.status, request.body.status);
    response.json(
      await updateMissionStatus(String(request.params.id), request.body),
    );
  },
);

missionsRouter.patch(
  '/:id/report',
  requireRoles('technician'),
  validateBody(reportSchema),
  async (request, response) => {
    response.json(
      await updateMissionReport(String(request.params.id), request.body),
    );
  },
);

missionsRouter.post(
  '/:id/photos',
  requireRoles('technician'),
  validateBody(photosSchema),
  async (request, response) => {
    response.json(
      await addMissionPhotos(String(request.params.id), request.body.urls),
    );
  },
);

missionsRouter.post(
  '/:id/emergency',
  requireRoles('technician'),
  validateBody(emergencySchema),
  async (request, response) => {
    response.status(201).json(
      await createMissionEmergency(String(request.params.id), request.body),
    );
  },
);
