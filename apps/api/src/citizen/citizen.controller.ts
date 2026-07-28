import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { CreateCitizenConfirmationDto } from './citizen.dto';
import { CitizenService } from './citizen.service';

@ApiTags('citizen')
@Controller('citizen')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CITIZEN, UserRole.ADMIN, UserRole.SUPERVISOR)
@ApiBearerAuth()
export class CitizenController {
  constructor(private readonly citizen: CitizenService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Situation consolidée du citoyen et de son contrat' })
  dashboard(@Req() request: { user: AuthenticatedUser }) {
    return this.citizen.getDashboard(request.user);
  }

  @Get('map')
  @ApiOperation({ summary: 'Coupures publiées et incidents publics approximatifs' })
  map(@Req() request: { user: AuthenticatedUser }) {
    return this.citizen.getMap(request.user);
  }

  @Get('safety')
  @ApiOperation({ summary: 'Consignes, contacts et FAQ de sécurité' })
  safety() {
    return this.citizen.getSafety();
  }

  @Post('confirmations')
  @ApiOperation({ summary: 'Confirmer une coupure ou le rétablissement du courant' })
  confirm(
    @Req() request: { user: AuthenticatedUser },
    @Body() dto: CreateCitizenConfirmationDto,
  ) {
    return this.citizen.confirm(request.user, dto);
  }
}
