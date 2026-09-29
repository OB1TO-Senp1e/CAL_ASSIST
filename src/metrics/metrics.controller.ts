import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metrics.getRegistry().contentType);
    const metrics = await this.metrics.getRegistry().metrics();
    res.send(metrics);
  }
}
