import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import {
  AssignIncidentDto,
  SendNotificationDto,
  UpdateFieldTeamDto,
  UpdateIncidentDto,
  UpdateOutageStatusDto,
  UpdateSettingsDto,
} from './admin.dto';
import { AdminService } from './admin.service';

type AuthenticatedRequest = { user: AuthenticatedUser };

@ApiTags('admin operations')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.DISPATCHER)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicateurs consolidés du centre des opérations' })
  dashboard() {
    return this.admin.getDashboard();
  }

  @Get('teams')
  @ApiOperation({ summary: 'Équipes terrain et missions actives' })
  teams() {
    return this.admin.getTeams();
  }

  @Patch('teams/:id')
  updateTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFieldTeamDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateTeam(id, dto, request.user);
  }

  @Patch('outages/:id/status')
  updateOutage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutageStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateOutageStatus(id, dto, request.user);
  }

  @Patch('incidents/:id')
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateIncident(id, dto, request.user);
  }

  @Post('incidents/:id/assign')
  assignIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignIncidentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.assignIncident(id, dto, request.user);
  }

  @Get('notifications')
  notifications() {
    return this.admin.getNotificationCampaigns();
  }

  @Post('notifications')
  sendNotification(
    @Body() dto: SendNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.sendNotification(dto, request.user);
  }

  @Post('notifications/:id/retry')
  retryNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.retryNotification(id, request.user);
  }

  @Get('audit')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  audit() {
    return this.admin.getAudit();
  }

  @Get('settings')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  settings() {
    return this.admin.getSettings();
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateSettings(dto, request.user);
  }
}
