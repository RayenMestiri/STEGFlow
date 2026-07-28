import mongoose, { Schema } from 'mongoose';
import { AUTH_EVENT_TYPES } from '../domain/constants.js';
import { baseOptions, stringId } from './common.js';

export const authEventSchema = new Schema(
  {
    _id: stringId,
    type: { type: String, enum: AUTH_EVENT_TYPES, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    userId: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    reason: { type: String, default: null },
  },
  baseOptions,
);
authEventSchema.index({ email: 1, createdAt: -1 });

export const AuthEvent = mongoose.model('AuthEvent', authEventSchema);
