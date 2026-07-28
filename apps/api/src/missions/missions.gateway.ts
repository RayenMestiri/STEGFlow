import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface TeamPositionEvent {
  missionId: string;
  teamCode: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
  capturedAt: string;
}

@WebSocketGateway({
  namespace: '/operations',
  cors: { origin: '*' },
})
export class MissionsGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('mission:watch')
  watchMission(
    @MessageBody() missionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(`mission:${missionId}`);
    return { watching: missionId };
  }

  broadcastPosition(event: TeamPositionEvent) {
    this.server.to(`mission:${event.missionId}`).emit('team:position', event);
    this.server.to('supervision').emit('team:position', event);
  }

  broadcastStatus(missionId: string, status: string) {
    this.server.to(`mission:${missionId}`).emit('mission:status', {
      missionId,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  broadcastReport(
    missionId: string,
    report: {
      diagnosis: string | null;
      estimatedRepairMinutes: number | null;
      requestedResources: string[];
      updatedAt: string;
    },
  ) {
    this.server.to(`mission:${missionId}`).emit('mission:report', {
      missionId,
      ...report,
    });
    this.server.to('supervision').emit('mission:report', {
      missionId,
      ...report,
    });
  }

  broadcastEmergency(
    missionId: string,
    teamCode: string,
    event: {
      type: string;
      note: string | null;
      latitude: number | null;
      longitude: number | null;
      createdAt: string;
    },
  ) {
    const payload = { missionId, teamCode, ...event };
    this.server.to(`mission:${missionId}`).emit('mission:emergency', payload);
    this.server.to('supervision').emit('mission:emergency', payload);
  }
}
