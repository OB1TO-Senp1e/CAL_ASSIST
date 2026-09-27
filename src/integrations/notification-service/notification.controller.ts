import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
  Patch,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationPayload } from './notification.interface';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Request() req,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.notificationService.getUserNotifications(req.user.id, {
      unreadOnly: unreadOnly === 'true',
      limit,
      offset,
    });
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationService.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(req.user.id, id);
  }

  @Post('read-all')
  async markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  @Patch(':id/dismiss')
  async dismiss(@Request() req, @Param('id') id: string) {
    return this.notificationService.dismissNotification(req.user.id, id);
  }

  @Post('send')
  async sendNotification(@Request() req, @Body() body: NotificationPayload) {
    return this.notificationService.sendNotification(req.user.id, body, body.channels);
  }

  @Post('reminder')
  async sendReminder(
    @Request() req,
    @Body()
    body: {
      title: string;
      message: string;
      entityType: string;
      entityId: string;
      actionUrl?: string;
    }
  ) {
    return this.notificationService.sendReminder(
      req.user.id,
      body.title,
      body.message,
      body.entityType,
      body.entityId,
      body.actionUrl
    );
  }

  @Post('conflict-alert')
  async sendConflictAlert(
    @Request() req,
    @Body()
    body: {
      title: string;
      message: string;
      entityType: string;
      entityId: string;
    }
  ) {
    return this.notificationService.sendConflictAlert(
      req.user.id,
      body.title,
      body.message,
      body.entityType,
      body.entityId
    );
  }

  @Get('preferences')
  async getPreferences(@Request() req) {
    return { message: 'Use context/preferences endpoint' };
  }

  @Post('preferences')
  async updatePreferences(@Request() req, @Body() body: any) {
    return this.notificationService.updatePreferences(req.user.id, body);
  }
}
