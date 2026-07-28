import mongoose, { Schema } from 'mongoose';
import { baseOptions, stringId } from './common.js';

export const auditLogSchema = new Schema(
  {
    _id: stringId,
    action: { type: String, required: true },
    category: { type: String, required: true },
    title: { type: String, required: true },
    details: { type: String, default: null },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'critical'],
      default: 'info',
    },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    actorEmail: { type: String, required: true },
    actorName: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
