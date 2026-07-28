import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateIncidentDto } from './incidents.dto';
import { IncidentEntity, IncidentSeverity } from './incident.entity';

@Injectable()
export class IncidentsService implements OnModuleInit {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (
      this.config.get('SEED_DEMO_DATA', 'true') !== 'true' ||
      (await this.incidents.count()) > 0
    ) return;
    await this.incidents.save(
      this.incidents.create({
        reference: 'INC-02048',
        type: 'fire',
        description: 'Étincelles visibles près du coffret électrique.',
        address: 'Rue Ibn Khaldoun, La Marsa',
        location: { type: 'Point', coordinates: [10.3303, 36.8782] },
        severity: IncidentSeverity.CRITICAL,
        photos: [],
        communityConfirmations: 7,
        contractNumber: null,
        assignedTeamCode: null,
        activity: [
          {
            at: new Date().toISOString(),
            label: 'Signalement citoyen reçu et classé critique',
            actor: 'Moteur de priorité STEGFlow',
          },
        ],
      }),
    );
  }

  findAll() {
    return this.incidents.find({ order: { createdAt: 'DESC' } });
  }

  async create(dto: CreateIncidentDto) {
    const sequence = await this.incidents.count();
    const dangerous = dto.type === 'fire' || dto.type === 'wire';
    return this.incidents.save(
      this.incidents.create({
        reference: `INC-${String(sequence + 1).padStart(5, '0')}`,
        type: dto.type,
        description: dto.description ?? null,
        address: dto.address,
        location: {
          type: 'Point',
          coordinates: [dto.longitude, dto.latitude],
        },
        photos: dto.photos ?? [],
        contractNumber: dto.contractNumber ?? null,
        assignedTeamCode: null,
        activity: [
          {
            at: new Date().toISOString(),
            label: dangerous
              ? 'Alerte de sécurité prioritaire déclenchée'
              : 'Signalement citoyen reçu',
            actor: 'STEGFlow',
          },
        ],
        severity: dangerous ? IncidentSeverity.CRITICAL : IncidentSeverity.MEDIUM,
      }),
    );
  }
}
