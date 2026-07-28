import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LoginDto, RegisterCitizenDto } from './auth.dto';
import { AuthContext, AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';

const REFRESH_COOKIE = 'steg_refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 8, windowSeconds: 300, includeEmail: true })
  @ApiOperation({ summary: 'Ouvrir une session' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives de connexion.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, this.contextOf(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 4, windowSeconds: 3600 })
  @ApiOperation({ summary: 'Créer un compte citoyen' })
  @ApiResponse({ status: 409, description: 'Adresse e-mail déjà utilisée.' })
  @ApiTooManyRequestsResponse({ description: 'Trop de créations de compte depuis cette adresse.' })
  async register(
    @Body() dto: RegisterCitizenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.registerCitizen(dto, this.contextOf(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 300 })
  @ApiOperation({ summary: 'Renouveler le jeton d’accès' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Jeton de session manquant.');
    try {
      const result = await this.auth.refresh(token, this.contextOf(request));
      this.setRefreshCookie(response, result.refreshToken);
      return { accessToken: result.accessToken, user: result.user };
    } catch (error) {
      // Une session invalide ne doit pas laisser traîner de cookie côté client.
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fermer la session et révoquer le jeton' })
  async logout(
    @Req() request: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.user.id, this.contextOf(request));
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté' })
  me(@Req() request: Request & { user: AuthenticatedUser }) {
    return request.user;
  }

  private contextOf(request: Request): AuthContext {
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: request.get('user-agent') ?? null,
    };
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: Number(this.config.get('JWT_REFRESH_TTL_SECONDS', 604800)) * 1000,
    });
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private cookieOptions() {
    const isProduction = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      // `strict` en production : le cookie ne part sur aucune navigation
      // entrante depuis un autre site, ce qui neutralise le CSRF sur /refresh.
      sameSite: (isProduction ? 'strict' : 'lax') as 'strict' | 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
