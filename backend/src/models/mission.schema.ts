import mongoose, { Schema } from 'mongoose';
import { MISSION_STATUSES } from '../domain/constants.js';
import { baseOptions, pointSchema, stringId } from './common.js';

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: MISSION_STATUSES, required: true },
    at: { type: String, required: true },
    source: { type: String, required: true },
  },
  { _id: false },
);

const emergencyEventSchema = new Schema(
  {
    type: { type: String, required: true },
    note: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    createdAt: { type: String, required: true },
  },
  { _id: false },
);

export const missionSchema = new Schema(
  {
    _id: stringId,
    reference: { type: String, required: true, unique: true },
    teamCode: { type: String, required: true, index: true },
    incidentId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: MISSION_STATUSES,
      default: 'assigned',
      index: true,
    },
    lastPosition: { type: pointSchema, default: null },
    lastPositionAt: { type: Date, default: null },
    etaMinutes: { type: Number, default: null },
    diagnosis: { type: String, default: null },
    estimatedRepairMinutes: { type: Number, default: null },
    reportNotes: { type: String, default: null },
    photoUrls: { type: [String], default: [] },
    requestedResources: { type: [String], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    emergencyEvents: { type: [emergencyEventSchema], default: [] },
    acceptedAt: { type: Date, default: null },
    enRouteAt: { type: Date, default: null },
    onSiteAt: { type: Date, default: null },
    restoredAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  baseOptions,
);
missionSchema.index({ lastPosition: '2dsphere' });

export const Mission = mongoose.model('Mission', missionSchema);
export type MissionDocument = InstanceType<typeof Mission>;
