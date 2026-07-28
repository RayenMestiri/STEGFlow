import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  AddMissionPhotosDto,
  CreateMissionEmergencyDto,
  UpdateMissionReportDto,
  UpdateMissionStatusDto,
  UpdatePositionDto,
} from './missions.dto';
import { MissionsService } from './missions.service';

@ApiTags('missions')
@Controller('missions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.DISPATCHER, UserRole.TECHNICIAN)
@ApiBearerAuth()
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get('tracking/current')
  @Roles(UserRole.CITIZEN, UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Suivi citoyen avec position volontairement approximative' })
  findCitizenTracking() {
    return this.missions.findCitizenTracking();
  }

  @Get('tracking/operations')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Suivi opérationnel exact des équipes actives' })
  findOperationsTracking() {
    return this.missions.findOperationsTracking();
  }

  @Get('me/dashboard')
  @ApiOperation({ summary: 'Poste de travail complet de l’équipe connectée' })
  findMaintenanceDashboard(@Req() request: { user: AuthenticatedUser }) {
    return this.missions.findMaintenanceDashboard(request.user);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Historique des interventions de l’équipe connectée' })
  findMyHistory(@Req() request: { user: AuthenticatedUser }) {
    return this.missions.findHistory(request.user.teamCode ?? 'Équipe 12');
  }

  @Get('current/me')
  findCurrent(@Req() request: { user: AuthenticatedUser }) {
    return this.missions.findCurrent(request.user.teamCode ?? 'Équipe 12');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.missions.findOne(id);
  }

  @Post(':id/position')
  @ApiOperation({ summary: 'Recevoir la position GPS d’une équipe en mission' })
  updatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.missions.updatePosition(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Valider une étape de l’intervention' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMissionStatusDto,
  ) {
    return this.missions.updateStatus(id, dto);
  }

  @Patch(':id/report')
  @ApiOperation({ summary: 'Enregistrer le diagnostic et les besoins terrain' })
  updateReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMissionReportDto,
  ) {
    return this.missions.updateReport(id, dto);
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Rattacher les preuves photo à la mission' })
  addPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMissionPhotosDto,
  ) {
    return this.missions.addPhotos(id, dto);
  }

  @Post(':id/emergency')
  @ApiOperation({ summary: 'Déclencher une alerte urgente depuis le terrain' })
  createEmergency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMissionEmergencyDto,
  ) {
    return this.missions.createEmergency(id, dto);
  }
}
