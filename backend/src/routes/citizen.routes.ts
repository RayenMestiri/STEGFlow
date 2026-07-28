import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  confirmCitizenSituation,
  getCitizenDashboard,
  getCitizenMap,
  getCitizenSafety,
} from '../services/citizen.service.js';

const confirmationSchema = z.object({
  kind: z.enum(['outage_confirmed', 'power_restored']),
  zoneId: z.string().trim().min(2).max(120),
  outageId: z.uuid().optional(),
  incidentId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
});

export const citizenRouter = Router();
citizenRouter.use(
  requireAuth,
  requireRoles('citizen', 'admin', 'supervisor'),
);

citizenRouter.get('/dashboard', async (request, response) => {
  response.json(await getCitizenDashboard(request.user!));
});

citizenRouter.get('/map', async (request, response) => {
  response.json(await getCitizenMap(request.user!));
});

citizenRouter.get('/safety', (_request, response) => {
  response.json(getCitizenSafety());
});

citizenRouter.post(
  '/confirmations',
  validateBody(confirmationSchema),
  async (request, response) => {
    response.status(201).json(
      await confirmCitizenSituation(request.user!, request.body),
    );
  },
);
