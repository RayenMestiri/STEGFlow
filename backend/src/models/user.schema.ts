import mongoose, { Schema } from 'mongoose';
import { USER_ROLES } from '../domain/constants.js';
import { baseOptions, stringId } from './common.js';

export const userSchema = new Schema(
  {
    _id: stringId,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, default: 'citizen', index: true },
    active: { type: Boolean, default: true },
    refreshTokenHash: { type: String, default: null, select: false },
    contractNumber: { type: String, default: null, index: true },
    address: { type: String, default: null },
    teamCode: { type: String, default: null, index: true },
    phone: { type: String, default: null },
    governorate: { type: String, default: null },
    delegation: { type: String, default: null },
    district: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
  },
  baseOptions,
);

export const User = mongoose.model('User', userSchema);
export type UserDocument = InstanceType<typeof User>;
