import { Router } from 'express';
import { z } from 'zod';
import { NOTIFICATION_CHANNELS } from '../domain/constants.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enqueueNotification } from '../services/notifications.service.js';

const notificationJobSchema = z.object({
  eventId: z.string().trim().min(2),
  audience: z.object({
    zoneId: z.string().optional(),
    customerIds: z.array(z.string()).optional(),
  }),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1),
  title: z.string().trim().min(2),
  body: z.string().trim().min(2),
  recipients: z.number().int().positive().optional(),
  audienceLabel: z.string().optional(),
  createdBy: z.string().optional(),
});

export const notificationsRouter = Router();
notificationsRouter.post(
  '/test',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  validateBody(notificationJobSchema),
  async (request, response) => {
    response.status(202).json(await enqueueNotification(request.body));
  },
);
