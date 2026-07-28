import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserEntity } from '../auth/user.entity';
import { FieldTeamEntity } from '../admin/admin.entity';
import { IncidentEntity } from '../incidents/incident.entity';
import { MissionEntity } from './mission.entity';
import { MissionsController } from './missions.controller';
import { MissionsGateway } from './missions.gateway';
import { MissionsService } from './missions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MissionEntity,
      IncidentEntity,
      FieldTeamEntity,
      UserEntity,
    ]),
    AuthModule,
  ],
  controllers: [MissionsController],
  providers: [MissionsService, MissionsGateway],
  exports: [MissionsService, MissionsGateway],
})
export class MissionsModule {}
