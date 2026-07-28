import mongoose, { Schema } from 'mongoose';
import { FIELD_TEAM_STATUSES } from '../domain/constants.js';
import { baseOptions, pointSchema, stringId } from './common.js';

export const fieldTeamSchema = new Schema(
  {
    _id: stringId,
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    leadName: { type: String, required: true },
    phone: { type: String, required: true },
    vehicle: { type: String, required: true },
    status: {
      type: String,
      enum: FIELD_TEAM_STATUSES,
      default: 'available',
      index: true,
    },
    members: { type: Number, default: 2 },
    base: { type: String, required: true },
    skills: { type: [String], default: [] },
    currentMissionId: { type: String, default: null },
    location: { type: pointSchema, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  baseOptions,
);
fieldTeamSchema.index({ location: '2dsphere' });

export const FieldTeam = mongoose.model('FieldTeam', fieldTeamSchema);
