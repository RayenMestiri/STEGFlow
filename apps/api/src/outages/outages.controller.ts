import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { CreateOutageDto } from './outages.dto';
import { OutagesService } from './outages.service';

@ApiTags('outages')
@Controller('outages')
export class OutagesController {
  constructor(private readonly outages: OutagesService) {}

  @Get()
  findAll() {
    return this.outages.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.outages.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.DISPATCHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Programmer une coupure' })
  create(@Body() dto: CreateOutageDto) {
    return this.outages.create(dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publier la coupure et lancer les notifications' })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.outages.publish(id);
  }
}
