import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailNotificationProvider } from './email-notification.provider';
import { SmsNotificationProvider } from './sms-notification.provider';
import { PushNotificationProvider } from './push-notification.provider';
import { InAppNotificationProvider } from './in-app-notification.provider';
import { PrismaService } from '@app/common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailNotificationProvider,
    SmsNotificationProvider,
    PushNotificationProvider,
    InAppNotificationProvider,
    PrismaService,
  ],
  exports: [
    NotificationService,
    EmailNotificationProvider,
    SmsNotificationProvider,
    PushNotificationProvider,
    InAppNotificationProvider,
  ],
})
export class NotificationModule {}
