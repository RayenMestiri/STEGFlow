import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CitizenModule } from './citizen/citizen.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MediaModule } from './media/media.module';
import { MissionsModule } from './missions/missions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutagesModule } from './outages/outages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        username: config.get('POSTGRES_USER', 'steg'),
        password: config.get('POSTGRES_PASSWORD', 'steg_dev_password'),
        database: config.get('POSTGRES_DB', 'stegflow'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV', 'development') === 'development',
        logging: config.get('DB_LOGGING', 'false') === 'true',
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    AuthModule,
    OutagesModule,
    IncidentsModule,
    MissionsModule,
    NotificationsModule,
    MediaModule,
    AdminModule,
    CitizenModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
