import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { IncidentEntity } from '../incidents/incident.entity';
import { MissionEntity } from '../missions/mission.entity';
import { OutageEntity } from '../outages/outage.entity';
import { CitizenConfirmationEntity } from './citizen-confirmation.entity';
import { CitizenController } from './citizen.controller';
import { CitizenService } from './citizen.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutageEntity,
      IncidentEntity,
      MissionEntity,
      CitizenConfirmationEntity,
    ]),
    AuthModule,
  ],
  controllers: [CitizenController],
  providers: [CitizenService],
})
export class CitizenModule {}
