import { randomUUID } from 'node:crypto';
import { Schema } from 'mongoose';

export const jsonOptions = {
  virtuals: false,
  versionKey: false,
  transform: (_document: unknown, returned: Record<string, unknown>) => {
    returned.id = returned._id;
    delete returned._id;
    return returned;
  },
};

export const baseOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: jsonOptions,
  toObject: jsonOptions,
} as const;

export const stringId = {
  type: String,
  default: randomUUID,
} as const;

export const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coordinates: number[]) => coordinates.length === 2,
        message: 'Une position GeoJSON doit contenir [longitude, latitude].',
      },
    },
  },
  { _id: false },
);

export function documentJson<T extends { toJSON(): unknown }>(document: T) {
  return document.toJSON();
}
