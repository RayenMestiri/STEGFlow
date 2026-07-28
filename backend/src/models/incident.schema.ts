import mongoose, { Schema } from 'mongoose';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../domain/constants.js';
import { baseOptions, pointSchema, stringId } from './common.js';

const activitySchema = new Schema(
  {
    at: { type: String, required: true },
    label: { type: String, required: true },
    actor: { type: String, required: true },
  },
  { _id: false },
);

export const incidentSchema = new Schema(
  {
    _id: stringId,
    reference: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    description: { type: String, default: null },
    address: { type: String, required: true },
    location: { type: pointSchema, required: true },
    severity: {
      type: String,
      enum: INCIDENT_SEVERITIES,
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: 'reported',
      index: true,
    },
    photos: { type: [String], default: [] },
    communityConfirmations: { type: Number, default: 1 },
    contractNumber: { type: String, default: null, index: true },
    reportedByUserId: { type: String, default: null, index: true },
    assignedTeamCode: { type: String, default: null, index: true },
    activity: { type: [activitySchema], default: [] },
  },
  baseOptions,
);
incidentSchema.index({ location: '2dsphere' });

export const Incident = mongoose.model('Incident', incidentSchema);
export type IncidentDocument = InstanceType<typeof Incident>;
