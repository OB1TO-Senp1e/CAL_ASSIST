import { Body, Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AiConsentService } from './ai-consent.service';

/**
 * C6 — one-time, revocable consent for AI processing of calendar content.
 * The gate itself lives in AiProviderService.assertConsent(); these routes
 * only manage the recorded grant.
 */
@Controller('ai/consent')
@UseGuards(JwtAuthGuard)
export class AiConsentController {
  constructor(private readonly consent: AiConsentService) {}

  @Get()
  async status(@Request() req) {
    return this.consent.getStatus(req.user.id);
  }

  @Post()
  async grant(@Request() req, @Body() body: { policyVersion?: string }) {
    const status = await this.consent.grant(req.user.id, body?.policyVersion);
    await this.consent.audit(req.user.id, 'AI_CONSENT_GRANTED');
    return status;
  }

  @Delete()
  async revoke(@Request() req) {
    const status = await this.consent.revoke(req.user.id);
    await this.consent.audit(req.user.id, 'AI_CONSENT_REVOKED');
    return status;
  }
}
