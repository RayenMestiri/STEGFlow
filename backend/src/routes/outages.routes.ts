import { Router } from 'express';
import { z } from 'zod';
import { resolveOutageZone } from '../domain/constants.js';
import { HttpError, notFound } from '../lib/http-error.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Outage } from '../models/index.js';
import { enqueueNotification } from '../services/notifications.service.js';

const createOutageSchema = z.object({
  zoneId: z.string().trim().min(2),
  zoneLabel: z.string().trim().min(2),
  reason: z.string().trim().min(3),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  supervisorApprovalRequired: z.boolean().optional().default(true),
});

export const outagesRouter = Router();

outagesRouter.get('/', async (_request, response) => {
  response.json(await Outage.find().sort({ startsAt: -1 }));
});

outagesRouter.get('/:id', async (request, response) => {
  const outage = await Outage.findById(request.params.id);
  if (!outage) throw notFound('Coupure introuvable');
  response.json(outage);
});

outagesRouter.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor', 'dispatcher'),
  validateBody(createOutageSchema),
  async (request, response) => {
    const sequence = await Outage.countDocuments();
    const zone = resolveOutageZone(
      request.body.zoneId,
      request.body.zoneLabel,
    );
    const outage = await Outage.create({
      ...request.body,
      reference: `OUT-${new Date().getFullYear()}-${String(sequence + 1).padStart(5, '0')}`,
      startsAt: new Date(request.body.startsAt),
      status: request.body.supervisorApprovalRequired
        ? 'pending_approval'
        : 'scheduled',
      affectedCustomers: zone?.affectedCustomers ?? 0,
      longitude: zone?.longitude ?? null,
      latitude: zone?.latitude ?? null,
      perimeter: null,
    });
    response.status(201).json(outage);
  },
);

outagesRouter.post(
  '/:id/publish',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  async (request, response) => {
    const outage = await Outage.findById(request.params.id);
    if (!outage) throw notFound('Coupure introuvable');
    if (outage.status === 'closed') {
      throw new HttpError(409, 'Une coupure clôturée ne peut pas être republiée.');
    }
    outage.status = 'notified';
    await outage.save();
    await enqueueNotification({
      eventId: `outage:${outage.id}:published`,
      audience: { zoneId: outage.zoneId },
      audienceLabel: outage.zoneLabel,
      channels: ['push', 'sms'],
      title: 'Coupure programmée',
      body: `Une interruption est prévue à ${outage.zoneLabel}.`,
      recipients: outage.affectedCustomers,
    });
    response.json(outage);
  },
);
