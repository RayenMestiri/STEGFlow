import mongoose, { Schema } from 'mongoose';
import { CONFIRMATION_KINDS } from '../domain/constants.js';
import { baseOptions, stringId } from './common.js';

export const citizenConfirmationSchema = new Schema(
  {
    _id: stringId,
    userId: { type: String, required: true, index: true },
    contractNumber: { type: String, default: null },
    zoneId: { type: String, required: true, index: true },
    kind: { type: String, enum: CONFIRMATION_KINDS, required: true },
    outageId: { type: String, default: null },
    incidentId: { type: String, default: null },
    note: { type: String, default: null },
  },
  baseOptions,
);
citizenConfirmationSchema.index(
  { userId: 1, zoneId: 1, kind: 1, outageId: 1, incidentId: 1 },
  { unique: true },
);

export const CitizenConfirmation = mongoose.model(
  'CitizenConfirmation',
  citizenConfirmationSchema,
);
