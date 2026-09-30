import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ShutdownLogger implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownLogger.name);

  onApplicationShutdown(signal?: string): void {
    this.logger.log(`Application shutdown complete${signal ? ` after ${signal}` : ''}`);
  }
}
