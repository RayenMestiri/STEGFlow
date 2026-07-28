import mongoose, { Schema } from 'mongoose';
import { baseOptions, stringId } from './common.js';

export const systemSettingSchema = new Schema(
  {
    _id: stringId,
    key: { type: String, required: true, unique: true },
    group: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: null },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: 'system' },
  },
  baseOptions,
);

export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
