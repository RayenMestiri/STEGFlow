import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationsService } from '../notifications/notifications.service';
import { OutageEntity, OutageStatus } from './outage.entity';
import { resolveOutageZone } from './outage-zones';
import { CreateOutageDto } from './outages.dto';

@Injectable()
export class OutagesService implements OnModuleInit {
  constructor(
    @InjectRepository(OutageEntity)
    private readonly outages: Repository<OutageEntity>,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const existing = await this.outages.find();
    const missingCoordinates = existing.filter(
      (outage) => outage.longitude === null || outage.latitude === null,
    );
    for (const outage of missingCoordinates) {
      const zone = resolveOutageZone(outage.zoneId, outage.zoneLabel);
      if (!zone) continue;
      outage.longitude = zone.longitude;
      outage.latitude = zone.latitude;
      await this.outages.save(outage);
    }

    if (
      this.config.get('SEED_DEMO_DATA', 'true') !== 'true' ||
      existing.length > 0
    ) {
      return;
    }
    const menzahZone = resolveOutageZone(
      'zone-el-menzah-6-a3',
      'El Menzah 6',
    )!;
    const bardoZone = resolveOutageZone('zone-le-bardo-b1', 'Le Bardo')!;
    await this.outages.save([
      this.outages.create({
        reference: 'OUT-2026-00001',
        zoneId: 'zone-el-menzah-6-a3',
        zoneLabel: 'El Menzah 6',
        reason: 'Maintenance préventive',
        status: OutageStatus.SCHEDULED,
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        durationMinutes: 90,
        affectedCustomers: menzahZone.affectedCustomers,
        longitude: menzahZone.longitude,
        latitude: menzahZone.latitude,
        perimeter: null,
        supervisorApprovalRequired: true,
      }),
      this.outages.create({
        reference: 'OUT-2026-00002',
        zoneId: 'zone-le-bardo-b1',
        zoneLabel: 'Le Bardo',
        reason: 'Rééquilibrage réseau',
        status: OutageStatus.PENDING_APPROVAL,
        startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        durationMinutes: 45,
        affectedCustomers: bardoZone.affectedCustomers,
        longitude: bardoZone.longitude,
        latitude: bardoZone.latitude,
        perimeter: null,
        supervisorApprovalRequired: true,
      }),
    ]);
  }

  findAll() {
    return this.outages.find({ order: { startsAt: 'DESC' } });
  }

  async findOne(id: string) {
    const outage = await this.outages.findOneBy({ id });
    if (!outage) throw new NotFoundException('Coupure introuvable');
    return outage;
  }

  async create(dto: CreateOutageDto) {
    const sequence = await this.outages.count();
    const zone = resolveOutageZone(dto.zoneId, dto.zoneLabel);
    return this.outages.save(
      this.outages.create({
        ...dto,
        reference: `OUT-${new Date().getFullYear()}-${String(sequence + 1).padStart(5, '0')}`,
        startsAt: new Date(dto.startsAt),
        status: dto.supervisorApprovalRequired
          ? OutageStatus.PENDING_APPROVAL
          : OutageStatus.SCHEDULED,
        affectedCustomers: zone?.affectedCustomers ?? 0,
        longitude: zone?.longitude ?? null,
        latitude: zone?.latitude ?? null,
        perimeter: null,
      }),
    );
  }

  async publish(id: string) {
    const outage = await this.findOne(id);
    outage.status = OutageStatus.NOTIFIED;
    const saved = await this.outages.save(outage);
    await this.notifications.enqueue({
      eventId: `outage:${saved.id}:published`,
      audience: { zoneId: saved.zoneId },
      channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
      title: 'Coupure programmée',
      body: `Une interruption est prévue à ${saved.zoneLabel}.`,
    });
    return saved;
  }
}
