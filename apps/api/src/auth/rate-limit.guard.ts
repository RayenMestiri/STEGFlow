import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export const RATE_LIMIT_KEY = 'steg:rate-limit';

export interface RateLimitOptions {
  /** Nombre de requêtes autorisées sur la fenêtre. */
  limit: number;
  /** Durée de la fenêtre glissante, en secondes. */
  windowSeconds: number;
  /**
   * Ajoute l'adresse e-mail du corps de requête à la clé de comptage : une
   * attaque distribuée sur un même compte est ainsi freinée même si les
   * adresses IP changent.
   */
  includeEmail?: boolean;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface Counter {
  hits: number;
  expiresAt: number;
}

/**
 * Limitation de débit en mémoire, suffisante pour un déploiement mono-instance.
 * Une bascule vers Redis (déjà présent pour BullMQ) sera nécessaire dès que
 * l'API tournera sur plusieurs répliques.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, Counter>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { body?: { email?: unknown } }>();
    const now = Date.now();
    this.sweep(now);

    const key = this.buildKey(context, request, options);
    const counter = this.counters.get(key);

    if (!counter || counter.expiresAt <= now) {
      this.counters.set(key, {
        hits: 1,
        expiresAt: now + options.windowSeconds * 1000,
      });
      this.setHeaders(http.getResponse<Response>(), options, options.limit - 1, 0);
      return true;
    }

    counter.hits += 1;
    const retryAfterSeconds = Math.ceil((counter.expiresAt - now) / 1000);
    const remaining = Math.max(0, options.limit - counter.hits);
    this.setHeaders(http.getResponse<Response>(), options, remaining, retryAfterSeconds);

    if (counter.hits > options.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Trop de tentatives. Réessayez dans ${retryAfterSeconds} seconde(s).`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildKey(
    context: ExecutionContext,
    request: Request & { body?: { email?: unknown } },
    options: RateLimitOptions,
  ): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'ip-inconnue';
    const email =
      options.includeEmail && typeof request.body?.email === 'string'
        ? request.body.email.toLowerCase()
        : '';
    return `${route}|${ip}|${email}`;
  }

  private setHeaders(
    response: Response,
    options: RateLimitOptions,
    remaining: number,
    retryAfterSeconds: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    if (retryAfterSeconds > 0) response.setHeader('Retry-After', retryAfterSeconds);
  }

  /** Purge les compteurs expirés au plus une fois par minute. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, counter] of this.counters) {
      if (counter.expiresAt <= now) this.counters.delete(key);
    }
  }
}
