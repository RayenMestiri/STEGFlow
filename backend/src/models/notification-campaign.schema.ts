import mongoose, { Schema } from 'mongoose';
import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from '../domain/constants.js';
import { baseOptions, stringId } from './common.js';

export const notificationCampaignSchema = new Schema(
  {
    _id: stringId,
    reference: { type: String, required: true, unique: true },
    eventId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    audienceLabel: { type: String, required: true },
    zoneId: { type: String, default: null },
    channels: [{ type: String, enum: NOTIFICATION_CHANNELS }],
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'queued' },
    recipients: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    createdBy: { type: String, default: 'Système STEGFlow' },
    sentAt: { type: Date, default: null },
  },
  baseOptions,
);

export const NotificationCampaign = mongoose.model(
  'NotificationCampaign',
  notificationCampaignSchema,
);
