import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'CalAssist',
    };
  }

  getStatus() {
    return {
      status: 'operational',
      version: '1.0.0',
      phases: {
        phase1: 'Foundation - Complete',
        phase2: 'Basic AI Integration - Complete',
        phase3: 'Planning & Intelligence - Complete',
        phase4: 'Advanced Features - Complete',
        phase5: 'Production & Scale - Pending',
      },
    };
  }
}
