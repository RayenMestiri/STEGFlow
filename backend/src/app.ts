import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins, env } from './config/env.js';
import { databaseStatus } from './db/connect.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { citizenRouter } from './routes/citizen.routes.js';
import { incidentsRouter } from './routes/incidents.routes.js';
import { mediaRouter } from './routes/media.routes.js';
import { missionsRouter } from './routes/missions.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { outagesRouter } from './routes/outages.routes.js';

const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'STEGFlow MEAN API',
    version: '2.0.0',
    description:
      'API Express/MongoDB pour le pilotage STEG, les citoyens et les équipes terrain.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/health': { get: { summary: 'État du backend et de MongoDB' } },
    '/auth/login': { post: { summary: 'Ouvrir une session' } },
    '/auth/register': { post: { summary: 'Créer un compte citoyen' } },
    '/citizen/dashboard': {
      get: {
        summary: 'Situation du citoyen',
        security: [{ bearerAuth: [] }],
      },
    },
    '/admin/dashboard': {
      get: {
        summary: 'Centre des opérations',
        security: [{ bearerAuth: [] }],
      },
    },
    '/missions/me/dashboard': {
      get: {
        summary: 'Poste équipe terrain',
        security: [{ bearerAuth: [] }],
      },
    },
  },
};

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (corsOrigins.has(origin)) return callback(null, true);
        if (/^http:\/\/(localhost|127(?:\.\d{1,3}){3}):420[0-2]$/.test(origin)) {
          return callback(null, true);
        }
        callback(new Error(`Origine CORS refusée : ${origin}`));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (_request, response) => {
    response.json({
      name: 'STEGFlow API',
      status: databaseStatus() === 'connected' ? 'operational' : 'degraded',
      version: '2.0.0',
      stack: 'MEAN',
      database: { engine: 'MongoDB', status: databaseStatus() },
      timestamp: new Date().toISOString(),
    });
  });
  api.use('/auth', authRouter);
  api.use('/outages', outagesRouter);
  api.use('/incidents', incidentsRouter);
  api.use('/missions', missionsRouter);
  api.use('/citizen', citizenRouter);
  api.use('/admin', adminRouter);
  api.use('/media', mediaRouter);
  api.use('/notifications', notificationsRouter);

  app.use('/api/v1', api);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
