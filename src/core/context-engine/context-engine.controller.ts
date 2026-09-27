import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ContextEngineService, UserContext } from './context-engine.service';

@Controller('context')
@UseGuards(JwtAuthGuard)
export class ContextEngineController {
  constructor(private readonly contextEngineService: ContextEngineService) {}

  @Get('user')
  async getUserContext(@Request() req): Promise<UserContext> {
    return this.contextEngineService.getUserContext(req.user.id);
  }

  @Post('preferences')
  async updatePreference(
    @Request() req,
    @Body()
    body: {
      key: string;
      value: any;
      category?: string;
      description?: string;
    }
  ) {
    return this.contextEngineService.updatePreference(
      req.user.id,
      body.key,
      body.value,
      body.category,
      body.description
    );
  }

  @Post('audit')
  async logAudit(
    @Request() req,
    @Body()
    body: {
      action: string;
      entityType: string;
      details: string;
      entityId?: string;
    }
  ) {
    return this.contextEngineService.logAuditEvent(
      req.user.id,
      body.action,
      body.entityType,
      body.details,
      body.entityId,
      req.ip,
      req.headers['user-agent']
    );
  }
}
