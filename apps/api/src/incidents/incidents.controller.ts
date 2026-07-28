import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateIncidentDto } from './incidents.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  findAll() {
    return this.incidents.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un signalement citoyen géolocalisé' })
  create(
    @Body() dto: CreateIncidentDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.incidents.create({
      ...dto,
      contractNumber: request.user.contractNumber ?? dto.contractNumber,
      reportedByUserId: request.user.id,
    });
  }
}
