import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  NotificationCampaignEntity,
  NotificationCampaignStatus,
} from '../admin/admin.entity';

export enum NotificationChannel {
  PUSH = 'push',
  SMS = 'sms',
  EMAIL = 'email',
}

export interface NotificationJob {
  eventId: string;
  audience: { zoneId?: string; customerIds?: string[] };
  channels: NotificationChannel[];
  title: string;
  body: string;
  recipients?: number;
  audienceLabel?: string;
  createdBy?: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @InjectQueue('notifications')
    private readonly queue: Queue<NotificationJob>,
    @InjectRepository(NotificationCampaignEntity)
    private readonly campaigns: Repository<NotificationCampaignEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (
      this.config.get('SEED_DEMO_DATA', 'true') !== 'true' ||
      (await this.campaigns.count()) > 0
    ) return;
    await this.campaigns.save([
      this.campaigns.create({
        reference: 'NTF-2026-00842',
        eventId: 'demo:outage:menzah',
        title: 'Coupure programmée — El Menzah 6',
        body: 'Une interruption est prévue à 16:30 pour maintenance préventive.',
        audienceLabel: 'Zone A3 · El Menzah 6',
        zoneId: 'zone-el-menzah-6-a3',
        channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
        status: NotificationCampaignStatus.DELIVERED,
        recipients: 1842,
        delivered: 1818,
        failed: 24,
        createdBy: 'Amine Khelifi',
        sentAt: new Date(Date.now() - 45 * 60_000),
      }),
      this.campaigns.create({
        reference: 'NTF-2026-00841',
        eventId: 'demo:incident:critical',
        title: 'Alerte sécurité — La Marsa',
        body: 'Évitez le secteur Rue Ibn Khaldoun. Une équipe est mobilisée.',
        audienceLabel: 'Périmètre de sécurité · La Marsa',
        zoneId: 'zone-la-marsa',
        channels: [NotificationChannel.PUSH, NotificationChannel.SMS, NotificationChannel.EMAIL],
        status: NotificationCampaignStatus.PARTIAL,
        recipients: 624,
        delivered: 609,
        failed: 15,
        createdBy: 'Centre des opérations',
        sentAt: new Date(Date.now() - 18 * 60_000),
      }),
    ]);
  }

  async enqueue(job: NotificationJob) {
    let campaign = await this.campaigns.findOneBy({ eventId: job.eventId });
    if (!campaign) {
      const sequence = (await this.campaigns.count()) + 1;
      campaign = this.campaigns.create({
        reference: `NTF-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`,
        eventId: job.eventId,
        title: job.title,
        body: job.body,
        audienceLabel:
          job.audienceLabel ??
          (job.audience.zoneId ? `Zone ${job.audience.zoneId}` : 'Clients sélectionnés'),
        zoneId: job.audience.zoneId ?? null,
        channels: job.channels,
        recipients: job.recipients ?? (job.audience.zoneId ? 1842 : job.audience.customerIds?.length ?? 1),
        delivered: 0,
        failed: 0,
        createdBy: job.createdBy ?? 'Système STEGFlow',
        sentAt: null,
      });
    }
    campaign.status = NotificationCampaignStatus.QUEUED;
    campaign = await this.campaigns.save(campaign);
    const queued = await this.queue.add('deliver', job, {
      jobId: job.eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return { campaign, jobId: queued.id };
  }
}
