import type { Request, Response } from 'express';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  login,
  logout,
  refreshSession,
  registerCitizen,
} from '../services/auth.service.js';

const REFRESH_COOKIE = 'steg_refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const loginSchema = z.object({
  email: z.email('Adresse e-mail invalide.').max(180).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8, 'Mot de passe trop court.').max(128),
});

const tunisianPhone = /^(\+216)?[\s.-]?[2459]\d[\s.-]?\d{3}[\s.-]?\d{3}$/;
const contractNumber = /^[A-Za-z0-9-]{4,24}$/;
const weakPassword =
  /(.)\1{3,}|0123|1234|2345|3456|4567|5678|6789|azerty|qwerty|motdepasse|password|steg|tunisie|admin/i;

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.email('Adresse e-mail invalide.').max(180).transform((value) => value.trim().toLowerCase()),
    password: z
      .string()
      .min(10)
      .max(128)
      .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
      .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
      .regex(/\d/, 'Le mot de passe doit contenir un chiffre.')
      .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir un caractère spécial.')
      .refine((value) => !weakPassword.test(value), {
        message: 'Le mot de passe contient une suite ou un mot trop facile à deviner.',
      }),
    phone: z.string().trim().regex(tunisianPhone, 'Numéro de téléphone tunisien invalide.').optional(),
    contractNumber: z.string().trim().regex(contractNumber, 'Numéro de contrat invalide.').optional(),
    address: z.string().trim().max(180).optional(),
    governorate: z.string().trim().max(80).optional(),
    delegation: z.string().trim().max(80).optional(),
    district: z.string().trim().max(80).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    acceptTerms: z.literal(true, {
      error: "Vous devez accepter les conditions d'utilisation pour créer un compte.",
    }),
  })
  .superRefine((payload, context) => {
    const password = payload.password.toLowerCase();
    const personalValues = [
      payload.firstName,
      payload.lastName,
      payload.email.split('@')[0] ?? '',
    ];
    if (
      personalValues.some(
        (value) => value.length >= 4 && password.includes(value.toLowerCase()),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message:
          'Le mot de passe ne doit pas reprendre votre nom ni votre adresse e-mail.',
      });
    }
  });

const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Trop de tentatives. Réessayez dans quelques minutes.',
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Trop de créations de compte depuis cette adresse.',
  },
});

function authContext(request: Request) {
  return {
    ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
    userAgent: request.get('user-agent') ?? null,
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: (env.NODE_ENV === 'production' ? 'strict' : 'lax') as
      | 'strict'
      | 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

function setRefreshCookie(response: Response, refreshToken: string) {
  response.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
  });
}

export const authRouter = Router();

authRouter.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (request, response) => {
    const result = await login(request.body, authContext(request));
    setRefreshCookie(response, result.refreshToken);
    response.json({ accessToken: result.accessToken, user: result.user });
  },
);

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (request, response) => {
    const result = await registerCitizen(request.body, authContext(request));
    setRefreshCookie(response, result.refreshToken);
    response
      .status(201)
      .json({ accessToken: result.accessToken, user: result.user });
  },
);

authRouter.post('/refresh', async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw new HttpError(401, 'Jeton de session manquant.');
  try {
    const result = await refreshSession(token, authContext(request));
    setRefreshCookie(response, result.refreshToken);
    response.json({ accessToken: result.accessToken, user: result.user });
  } catch (error) {
    response.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw error;
  }
});

authRouter.post('/logout', requireAuth, async (request, response) => {
  await logout(request.user!.id, authContext(request));
  response.clearCookie(REFRESH_COOKIE, cookieOptions());
  response.json({ success: true });
});

authRouter.get('/me', requireAuth, (request, response) => {
  response.json(request.user);
});
