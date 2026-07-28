import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthEventEntity } from '../auth/auth-event.entity';
import { AuthModule } from '../auth/auth.module';
import { IncidentEntity } from '../incidents/incident.entity';
import { MissionEntity } from '../missions/mission.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutageEntity } from '../outages/outage.entity';
import { AdminController } from './admin.controller';
import {
  FieldTeamEntity,
  NotificationCampaignEntity,
  OperationalAuditEntity,
  SystemSettingEntity,
} from './admin.entity';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutageEntity,
      IncidentEntity,
      MissionEntity,
      FieldTeamEntity,
      NotificationCampaignEntity,
      OperationalAuditEntity,
      SystemSettingEntity,
      AuthEventEntity,
    ]),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
