import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { seedDatabase } from './db/seed.js';
import { configureOperationsRealtime } from './realtime/operations.js';
import {
  closeNotificationInfrastructure,
  startNotificationWorker,
} from './services/notifications.service.js';

async function bootstrap() {
  await connectDatabase();
  await seedDatabase();

  const app = createApp();
  const httpServer = createServer(app);
  const socketServer = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });
  configureOperationsRealtime(socketServer);
  startNotificationWorker();

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(
      `STEGFlow MEAN API opérationnelle sur http://localhost:${env.PORT}/api/v1`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} reçu, arrêt propre du backend...`);
    socketServer.close();
    httpServer.close(async () => {
      await closeNotificationInfrastructure().catch(() => undefined);
      await disconnectDatabase().catch(() => undefined);
      process.exit(0);
    });
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Impossible de démarrer le backend STEGFlow', error);
  process.exit(1);
});
