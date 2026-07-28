import type { Server } from 'socket.io';

let operationsServer: ReturnType<Server['of']> | null = null;

export function configureOperationsRealtime(server: Server) {
  operationsServer = server.of('/operations');
  operationsServer.on('connection', (socket) => {
    socket.on('mission:watch', (missionId: string, acknowledge?: (value: unknown) => void) => {
      void socket.join(`mission:${missionId}`);
      acknowledge?.({ watching: missionId });
    });
    socket.on('supervision:watch', () => {
      void socket.join('supervision');
    });
  });
}

export function emitTeamPosition(event: {
  missionId: string;
  teamCode: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
  capturedAt: string;
}) {
  operationsServer?.to(`mission:${event.missionId}`).emit('team:position', event);
  operationsServer?.to('supervision').emit('team:position', event);
}

export function emitMissionStatus(missionId: string, status: string) {
  operationsServer?.to(`mission:${missionId}`).emit('mission:status', {
    missionId,
    status,
    updatedAt: new Date().toISOString(),
  });
  operationsServer?.to('supervision').emit('mission:status', {
    missionId,
    status,
    updatedAt: new Date().toISOString(),
  });
}

export function emitMissionReport(
  missionId: string,
  report: Record<string, unknown>,
) {
  const payload = { missionId, ...report };
  operationsServer?.to(`mission:${missionId}`).emit('mission:report', payload);
  operationsServer?.to('supervision').emit('mission:report', payload);
}

export function emitMissionEmergency(
  missionId: string,
  teamCode: string,
  event: Record<string, unknown>,
) {
  const payload = { missionId, teamCode, ...event };
  operationsServer
    ?.to(`mission:${missionId}`)
    .emit('mission:emergency', payload);
  operationsServer?.to('supervision').emit('mission:emergency', payload);
}
