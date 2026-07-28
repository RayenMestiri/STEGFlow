import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Incident } from '../models/index.js';

const incidentSchema = z.object({
  type: z.enum(['outage', 'voltage', 'fire', 'wire', 'meter', 'other']),
  description: z.string().trim().max(2_000).optional(),
  address: z.string().trim().min(3).max(220),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photos: z.array(z.url()).max(12).optional(),
  contractNumber: z.string().trim().max(40).optional(),
});

export const incidentsRouter = Router();

incidentsRouter.get('/', async (_request, response) => {
  response.json(await Incident.find().sort({ createdAt: -1 }));
});

incidentsRouter.post(
  '/',
  requireAuth,
  validateBody(incidentSchema),
  async (request, response) => {
    const sequence = await Incident.countDocuments();
    const dangerous =
      request.body.type === 'fire' || request.body.type === 'wire';
    const incident = await Incident.create({
      reference: `INC-${String(sequence + 1).padStart(5, '0')}`,
      type: request.body.type,
      description: request.body.description ?? null,
      address: request.body.address,
      location: {
        type: 'Point',
        coordinates: [request.body.longitude, request.body.latitude],
      },
      photos: request.body.photos ?? [],
      contractNumber:
        request.user!.contractNumber ?? request.body.contractNumber ?? null,
      reportedByUserId: request.user!.id,
      severity: dangerous ? 'critical' : 'medium',
      activity: [
        {
          at: new Date().toISOString(),
          label: dangerous
            ? 'Alerte de sécurité prioritaire déclenchée'
            : 'Signalement citoyen reçu',
          actor: 'STEGFlow',
        },
      ],
    });
    response.status(201).json(incident);
  },
);
