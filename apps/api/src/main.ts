import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Derrière le reverse proxy, `request.ip` doit refléter le client réel :
  // la limitation de débit et le journal d'audit en dépendent.
  app.set('trust proxy', config.get('TRUST_PROXY', 'loopback'));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', 'http://localhost:4200,http://localhost:4201,http://localhost:4202')
      .split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('STEGFlow API')
    .setDescription('API opérationnelle pour les coupures, incidents, équipes et notifications.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get<number>('PORT', 3000), '0.0.0.0');
}

void bootstrap();
