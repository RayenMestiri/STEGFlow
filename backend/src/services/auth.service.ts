import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../domain/constants.js';
import { HttpError } from '../lib/http-error.js';
import { AuthEvent, User } from '../models/index.js';
import type { AuthContext, AuthUser, TokenPayload } from '../types/auth.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const DUMMY_PASSWORD = 'stegflow-timing-equalizer';
let dummyPasswordHash: string | null = null;

export function toPublicUser(user: any): AuthUser {
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as UserRole,
    contractNumber: user.contractNumber ?? null,
    address: user.address ?? null,
    teamCode: user.teamCode ?? null,
    phone: user.phone ?? null,
    governorate: user.governorate ?? null,
    delegation: user.delegation ?? null,
    district: user.district ?? null,
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    lastLoginAt: user.lastLoginAt
      ? new Date(user.lastLoginAt).toISOString()
      : null,
  };
}

async function recordAuthEvent(
  type: string,
  email: string,
  userId: string | null,
  context: AuthContext,
  reason: string | null = null,
) {
  try {
    await AuthEvent.create({
      type: type as any,
      email,
      userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 255) ?? null,
      reason,
    });
  } catch (error) {
    console.warn('Journal d’authentification indisponible', error);
  }
}

function issueTokens(user: any) {
  const base = {
    sub: String(user._id),
    email: user.email,
    role: user.role as UserRole,
  };
  const accessToken = jwt.sign(
    { ...base, type: 'access' } satisfies TokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL_SECONDS },
  );
  const refreshToken = jwt.sign(
    { ...base, type: 'refresh' } satisfies TokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL_SECONDS },
  );
  return { accessToken, refreshToken };
}

export async function login(
  payload: { email: string; password: string },
  context: AuthContext,
) {
  const email = payload.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select(
    '+passwordHash +refreshTokenHash',
  );

  if (!user) {
    dummyPasswordHash ??= await bcrypt.hash(DUMMY_PASSWORD, 12);
    await bcrypt.compare(payload.password, dummyPasswordHash);
    await recordAuthEvent(
      'login_failed',
      email,
      null,
      context,
      'compte inexistant',
    );
    throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60_000,
    );
    await recordAuthEvent(
      'login_failed',
      email,
      String(user._id),
      context,
      'compte verrouillé',
    );
    throw new HttpError(
      403,
      `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${minutes} minute(s).`,
    );
  }

  if (!user.active) {
    await recordAuthEvent(
      'login_failed',
      email,
      String(user._id),
      context,
      'compte désactivé',
    );
    throw new HttpError(
      403,
      'Ce compte est désactivé. Contactez votre administrateur.',
    );
  }

  const passwordValid = user.passwordHash.startsWith('$argon2')
    ? await argon2.verify(user.passwordHash, payload.password).catch(() => false)
    : await bcrypt.compare(payload.password, user.passwordHash);
  if (!passwordValid) {
    user.failedLoginAttempts += 1;
    const locked = user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    if (locked) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = new Date(
        Date.now() + LOCK_DURATION_MINUTES * 60_000,
      );
      user.refreshTokenHash = null;
    }
    await user.save();
    await recordAuthEvent(
      locked ? 'account_locked' : 'login_failed',
      email,
      String(user._id),
      context,
      locked
        ? `${MAX_FAILED_ATTEMPTS} échecs consécutifs`
        : 'mot de passe incorrect',
    );
    throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = context.ipAddress;
  if (user.passwordHash.startsWith('$argon2')) {
    user.passwordHash = await bcrypt.hash(payload.password, 12);
  }
  const tokens = issueTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
  await user.save();
  await recordAuthEvent(
    'login_success',
    email,
    String(user._id),
    context,
  );
  return { user: toPublicUser(user), ...tokens };
}

export async function registerCitizen(
  payload: Record<string, any>,
  context: AuthContext,
) {
  const email = String(payload.email).trim().toLowerCase();
  if (await User.exists({ email })) {
    throw new HttpError(409, 'Cette adresse e-mail est déjà utilisée.');
  }

  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(payload.password, 12),
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: 'citizen',
    contractNumber: payload.contractNumber ?? null,
    address: payload.address ?? null,
    phone: payload.phone ?? null,
    governorate: payload.governorate ?? null,
    delegation: payload.delegation ?? null,
    district: payload.district ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    termsAcceptedAt: new Date(),
    teamCode: null,
    lastLoginAt: new Date(),
    lastLoginIp: context.ipAddress,
  });
  const tokens = issueTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
  await user.save();
  await recordAuthEvent('register', email, String(user._id), context);
  return { user: toPublicUser(user), ...tokens };
}

export async function refreshSession(
  refreshToken: string,
  context: AuthContext,
) {
  let payload: TokenPayload;
  try {
    payload = jwt.verify(
      refreshToken,
      env.JWT_REFRESH_SECRET,
    ) as TokenPayload;
  } catch {
    throw new HttpError(
      401,
      'Votre session a expiré. Veuillez vous reconnecter.',
    );
  }
  if (payload.type !== 'refresh') {
    throw new HttpError(
      401,
      'Votre session a expiré. Veuillez vous reconnecter.',
    );
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user || !user.active || !user.refreshTokenHash) {
    if (user) {
      await recordAuthEvent(
        'refresh_reuse',
        user.email,
        String(user._id),
        context,
        'aucune session active',
      );
    }
    throw new HttpError(
      401,
      'Votre session a expiré. Veuillez vous reconnecter.',
    );
  }

  if (!(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
    user.refreshTokenHash = null;
    await user.save();
    await recordAuthEvent(
      'refresh_reuse',
      user.email,
      String(user._id),
      context,
      'jeton de rafraîchissement obsolète',
    );
    throw new HttpError(
      401,
      'Votre session a expiré. Veuillez vous reconnecter.',
    );
  }

  const tokens = issueTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 12);
  await user.save();
  return { user: toPublicUser(user), ...tokens };
}

export async function logout(userId: string, context: AuthContext) {
  const user = await User.findById(userId).select('+refreshTokenHash');
  if (!user) return;
  user.refreshTokenHash = null;
  await user.save();
  await recordAuthEvent(
    'logout',
    user.email,
    String(user._id),
    context,
  );
}
