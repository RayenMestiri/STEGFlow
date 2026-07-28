import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../domain/constants.js';
import { HttpError } from '../lib/http-error.js';
import { User } from '../models/index.js';
import { toPublicUser } from '../services/auth.service.js';
import type { TokenPayload } from '../types/auth.js';

export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentification requise.');
  }
  let payload: TokenPayload;
  try {
    payload = jwt.verify(
      authorization.slice('Bearer '.length),
      env.JWT_ACCESS_SECRET,
    ) as TokenPayload;
  } catch {
    throw new HttpError(401, 'Votre session a expiré.');
  }
  if (payload.type !== 'access') {
    throw new HttpError(401, 'Jeton d’accès invalide.');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) {
    throw new HttpError(401, 'Compte introuvable ou désactivé.');
  }
  request.user = toPublicUser(user);
  next();
}

export function requireRoles(...allowed: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user || !allowed.includes(request.user.role)) {
      throw new HttpError(403, 'Accès refusé pour ce rôle.');
    }
    next();
  };
}
