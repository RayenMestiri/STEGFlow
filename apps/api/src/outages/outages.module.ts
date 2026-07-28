import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutageEntity } from './outage.entity';
import { OutagesController } from './outages.controller';
import { OutagesService } from './outages.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutageEntity]), AuthModule, NotificationsModule],
  controllers: [OutagesController],
  providers: [OutagesService],
  exports: [OutagesService],
})
export class OutagesModule {}
