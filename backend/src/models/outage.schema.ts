import mongoose, { Schema } from 'mongoose';
import { OUTAGE_STATUSES } from '../domain/constants.js';
import { baseOptions, stringId } from './common.js';

export const outageSchema = new Schema(
  {
    _id: stringId,
    reference: { type: String, required: true, unique: true },
    zoneId: { type: String, required: true, index: true },
    zoneLabel: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: OUTAGE_STATUSES, default: 'draft', index: true },
    startsAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true },
    affectedCustomers: { type: Number, default: 0 },
    longitude: { type: Number, default: null },
    latitude: { type: Number, default: null },
    perimeter: { type: Schema.Types.Mixed, default: null },
    supervisorApprovalRequired: { type: Boolean, default: false },
  },
  baseOptions,
);

export const Outage = mongoose.model('Outage', outageSchema);
export type OutageDocument = InstanceType<typeof Outage>;
