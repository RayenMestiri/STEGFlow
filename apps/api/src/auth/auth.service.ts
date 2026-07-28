import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { AuthEventEntity, AuthEventType } from './auth-event.entity';
import { LoginDto, RegisterCitizenDto } from './auth.dto';
import { AuthenticatedUser, JwtPayload } from './auth.types';
import { UserEntity, UserRole } from './user.entity';

/** Contexte réseau d'une requête d'authentification, pour le journal d'audit. */
export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Nombre d'échecs consécutifs avant verrouillage temporaire du compte. */
const MAX_FAILED_ATTEMPTS = 5;
/** Durée du verrouillage, en minutes. */
const LOCK_DURATION_MINUTES = 15;

/**
 * Empreinte d'un mot de passe factice : elle sert à consommer le même temps
 * CPU quand l'adresse e-mail n'existe pas, afin qu'un attaquant ne puisse pas
 * distinguer « compte inconnu » de « mot de passe erroné » au chronomètre.
 */
const DUMMY_PASSWORD = 'stegflow-timing-equalizer';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyPasswordHash?: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(AuthEventEntity)
    private readonly authEvents: Repository<AuthEventEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    this.dummyPasswordHash = await argon2.hash(DUMMY_PASSWORD);
    if (this.config.get('SEED_DEMO_DATA', 'true') !== 'true') return;
    await this.seedDemoUsers();
  }

  async login(dto: LoginDto, context: AuthContext = {}) {
    const email = dto.email.toLowerCase();
    const user = await this.users.findOneBy({ email });

    if (!user) {
      // Vérification factice : même coût qu'un vrai contrôle de mot de passe.
      await argon2.verify(await this.getDummyHash(), dto.password).catch(() => false);
      await this.record(AuthEventType.LOGIN_FAILED, email, null, context, 'compte inexistant');
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      await this.record(AuthEventType.LOGIN_FAILED, email, user.id, context, 'compte verrouillé');
      throw new ForbiddenException(
        `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${minutes} minute(s).`,
      );
    }

    if (!user.active) {
      await this.record(AuthEventType.LOGIN_FAILED, email, user.id, context, 'compte désactivé');
      throw new ForbiddenException('Ce compte est désactivé. Contactez votre administrateur.');
    }

    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      await this.registerFailedAttempt(user, context);
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    user.lastLoginIp = context.ipAddress ?? null;

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await this.users.save(user);
    await this.record(AuthEventType.LOGIN_SUCCESS, email, user.id, context);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async registerCitizen(dto: RegisterCitizenDto, context: AuthContext = {}) {
    const email = dto.email.toLowerCase();
    if (await this.users.existsBy({ email })) {
      throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
    }

    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: UserRole.CITIZEN,
        contractNumber: dto.contractNumber ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        governorate: dto.governorate ?? null,
        delegation: dto.delegation ?? null,
        district: dto.district ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        termsAcceptedAt: new Date(),
        teamCode: null,
        refreshTokenHash: null,
        lastLoginAt: new Date(),
        lastLoginIp: context.ipAddress ?? null,
      }),
    );

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await this.users.save(user);
    await this.record(AuthEventType.REGISTER, email, user.id, context);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async refresh(refreshToken: string, context: AuthContext = {}) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || !user.active) {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    if (!user.refreshTokenHash) {
      // Jeton présenté après une déconnexion : possible rejeu, on trace.
      await this.record(
        AuthEventType.REFRESH_REUSE,
        user.email,
        user.id,
        context,
        'aucune session active',
      );
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    if (!(await argon2.verify(user.refreshTokenHash, refreshToken))) {
      // Le jeton est valide cryptographiquement mais n'est plus le dernier
      // émis : on révoque toute la session par précaution.
      await this.users.update(user.id, { refreshTokenHash: null });
      await this.record(
        AuthEventType.REFRESH_REUSE,
        user.email,
        user.id,
        context,
        'jeton de rafraîchissement obsolète',
      );
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await this.users.save(user);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async logout(userId: string, context: AuthContext = {}) {
    const user = await this.users.findOneBy({ id: userId });
    await this.users.update(userId, { refreshTokenHash: null });
    if (user) await this.record(AuthEventType.LOGOUT, user.email, user.id, context);
  }

  async validateUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !user.active) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  private async registerFailedAttempt(user: UserEntity, context: AuthContext) {
    user.failedLoginAttempts += 1;
    const locked = user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    if (locked) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000);
      user.failedLoginAttempts = 0;
      // La session en cours est révoquée : un vol de jeton ne survit pas à
      // une tentative de force brute sur le même compte.
      user.refreshTokenHash = null;
    }
    await this.users.save(user);
    await this.record(
      locked ? AuthEventType.ACCOUNT_LOCKED : AuthEventType.LOGIN_FAILED,
      user.email,
      user.id,
      context,
      locked ? `${MAX_FAILED_ATTEMPTS} échecs consécutifs` : 'mot de passe incorrect',
    );
  }

  private async record(
    type: AuthEventType,
    email: string,
    userId: string | null,
    context: AuthContext,
    reason?: string,
  ) {
    try {
      await this.authEvents.insert({
        type,
        email,
        userId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 255) ?? null,
        reason: reason ?? null,
      });
    } catch (error) {
      // Le journal ne doit jamais bloquer une authentification légitime.
      this.logger.warn(`Journal d'authentification indisponible: ${String(error)}`);
    }
  }

  private async getDummyHash(): Promise<string> {
    this.dummyPasswordHash ??= await argon2.hash(DUMMY_PASSWORD);
    return this.dummyPasswordHash;
  }

  private async issueTokens(user: UserEntity) {
    const base = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' satisfies JwtPayload['type'] },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: Number(this.config.get('JWT_ACCESS_TTL_SECONDS', 900)),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' satisfies JwtPayload['type'] },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: Number(this.config.get('JWT_REFRESH_TTL_SECONDS', 604800)),
      },
    );
    return { accessToken, refreshToken };
  }

  private toPublicUser(user: UserEntity): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      contractNumber: user.contractNumber,
      address: user.address,
      teamCode: user.teamCode,
      phone: user.phone,
      governorate: user.governorate,
      delegation: user.delegation,
      district: user.district,
      latitude: user.latitude,
      longitude: user.longitude,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  private async seedDemoUsers() {
    const demoUsers = [
      {
        email: 'superviseur@steg.tn',
        password: 'Admin2026!',
        firstName: 'Amine',
        lastName: 'Khelifi',
        role: UserRole.SUPERVISOR,
        teamCode: null,
        contractNumber: null,
        address: null,
        phone: null,
        governorate: 'Tunis',
        delegation: 'Cité El Khadra',
        district: null,
        latitude: null,
        longitude: null,
      },
      {
        email: 'technicien@steg.tn',
        password: 'Tech2026!',
        firstName: 'Mehdi',
        lastName: 'K.',
        role: UserRole.TECHNICIAN,
        teamCode: 'Équipe 12',
        contractNumber: null,
        address: null,
        phone: null,
        governorate: 'Tunis',
        delegation: 'El Menzah',
        district: null,
        latitude: null,
        longitude: null,
      },
      {
        email: 'citoyen@steg.tn',
        password: 'Client2026!',
        firstName: 'Mohamed',
        lastName: 'Ben Salem',
        role: UserRole.CITIZEN,
        teamCode: null,
        contractNumber: 'STEG-8042',
        address: '14, Rue des Orangers',
        phone: '+21620123456',
        governorate: 'Tunis',
        delegation: 'El Menzah',
        district: 'El Menzah 6',
        latitude: 36.8427,
        longitude: 10.1764,
      },
    ];

    for (const demo of demoUsers) {
      if (await this.users.existsBy({ email: demo.email })) continue;
      const { password, ...profile } = demo;
      await this.users.save(
        this.users.create({
          ...profile,
          passwordHash: await argon2.hash(password),
          refreshTokenHash: null,
          termsAcceptedAt: new Date(),
        }),
      );
    }
  }
}
