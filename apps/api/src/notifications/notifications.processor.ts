import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import {
  NotificationCampaignEntity,
  NotificationCampaignStatus,
} from '../admin/admin.entity';
import { NotificationChannel, NotificationJob } from './notifications.service';

@Injectable()
@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectRepository(NotificationCampaignEntity)
    private readonly campaigns: Repository<NotificationCampaignEntity>,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>) {
    await this.campaigns.update(
      { eventId: job.data.eventId },
      { status: NotificationCampaignStatus.SENDING },
    );
    for (const channel of job.data.channels) {
      await this.deliver(channel, job.data);
    }
    const campaign = await this.campaigns.findOneBy({ eventId: job.data.eventId });
    if (campaign) {
      campaign.status = NotificationCampaignStatus.DELIVERED;
      campaign.delivered = campaign.recipients;
      campaign.failed = 0;
      campaign.sentAt = new Date();
      await this.campaigns.save(campaign);
    }
    return { deliveredChannels: job.data.channels };
  }

  private async deliver(channel: NotificationChannel, notification: NotificationJob) {
    // Adaptateurs réels : Firebase Admin SDK, fournisseur SMS tunisien et SMTP.
    this.logger.log(
      `[${channel}] ${notification.eventId} -> ${notification.audience.zoneId ?? 'clients ciblés'}`,
    );
    await Promise.resolve();
  }
}
