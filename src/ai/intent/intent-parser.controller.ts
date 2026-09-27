import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { IntentParserService } from './intent-parser.service';

@Controller('ai/intent')
@UseGuards(JwtAuthGuard)
export class IntentParserController {
  constructor(private readonly intentParserService: IntentParserService) {}

  @Post('parse')
  async parseIntent(@Request() req, @Body() body: { text: string }) {
    return this.intentParserService.parseIntent(req.user.id, body.text);
  }
}
