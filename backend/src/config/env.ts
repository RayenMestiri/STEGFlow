import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI est obligatoire.'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CLOUDINARY_URL: z.string().startsWith('cloudinary://'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200,http://localhost:4201,http://localhost:4202'),
  TRUST_PROXY: z.string().default('loopback'),
  SEED_DEMO_DATA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Configuration backend invalide — ${details}`);
}

export const env = parsed.data;
export const corsOrigins = new Set(
  env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
);
