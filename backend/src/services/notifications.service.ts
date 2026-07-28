import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import type { NotificationChannel } from '../domain/constants.js';
import { resolveOutageZone } from '../domain/constants.js';
import { NotificationCampaign } from '../models/index.js';

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

const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
const notificationQueue = new Queue<NotificationJob>('notifications', {
  connection: queueConnection,
});
let worker: Worker<NotificationJob> | null = null;

export async function enqueueNotification(job: NotificationJob) {
  let campaign = await NotificationCampaign.findOne({ eventId: job.eventId });
  if (!campaign) {
    const sequence = (await NotificationCampaign.countDocuments()) + 1;
    const zone = job.audience.zoneId
      ? resolveOutageZone(job.audience.zoneId, job.audienceLabel ?? '')
      : null;
    campaign = await NotificationCampaign.create({
      reference: `NTF-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`,
      eventId: job.eventId,
      title: job.title,
      body: job.body,
      audienceLabel:
        job.audienceLabel ??
        (job.audience.zoneId
          ? `Zone ${job.audience.zoneId}`
          : 'Clients sélectionnés'),
      zoneId: job.audience.zoneId ?? null,
      channels: job.channels,
      recipients:
        job.recipients ??
        zone?.affectedCustomers ??
        job.audience.customerIds?.length ??
        1,
      createdBy: job.createdBy ?? 'Système STEGFlow',
    });
  }
  campaign.status = 'queued';
  await campaign.save();
  const queued = await notificationQueue.add('deliver', job, {
    jobId: job.eventId.replace(/[^a-zA-Z0-9:_-]/g, '-'),
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
  return { campaign, jobId: queued.id };
}

export function startNotificationWorker() {
  if (worker) return worker;
  const workerConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  worker = new Worker<NotificationJob>(
    'notifications',
    async (job) => {
      const campaign = await NotificationCampaign.findOne({
        eventId: job.data.eventId,
      });
      if (!campaign) return { deliveredChannels: [] };
      campaign.status = 'sending';
      await campaign.save();

      // Les adaptateurs fournisseur (FCM/SMS/SMTP) se branchent ici.
      campaign.status = 'delivered';
      campaign.delivered = campaign.recipients;
      campaign.failed = 0;
      campaign.sentAt = new Date();
      await campaign.save();
      return { deliveredChannels: job.data.channels };
    },
    { connection: workerConnection },
  );
  worker.on('failed', async (job) => {
    if (!job) return;
    await NotificationCampaign.updateOne(
      { eventId: job.data.eventId },
      { status: 'failed' },
    );
  });
  return worker;
}

export async function closeNotificationInfrastructure() {
  await worker?.close();
  worker = null;
  await notificationQueue.close();
  await queueConnection.quit();
}
