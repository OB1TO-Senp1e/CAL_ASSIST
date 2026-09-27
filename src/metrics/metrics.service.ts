import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly activeUsers: Gauge;
  readonly scheduledTasks: Gauge;
  readonly aiRequestsTotal: Counter;
  readonly aiRequestDuration: Histogram;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry, prefix: 'calassist_' });

    this.httpRequestsTotal = new Counter({
      name: 'calassist_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'calassist_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.activeUsers = new Gauge({
      name: 'calassist_active_users',
      help: 'Number of active users',
      registers: [this.registry],
    });

    this.scheduledTasks = new Gauge({
      name: 'calassist_scheduled_tasks',
      help: 'Number of scheduled tasks in queue',
      registers: [this.registry],
    });

    this.aiRequestsTotal = new Counter({
      name: 'calassist_ai_requests_total',
      help: 'Total number of AI requests',
      labelNames: ['provider', 'operation', 'status'],
      registers: [this.registry],
    });

    this.aiRequestDuration = new Histogram({
      name: 'calassist_ai_request_duration_seconds',
      help: 'AI request duration in seconds',
      labelNames: ['provider', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    this.activeUsers.set(0);
    this.scheduledTasks.set(0);
  }

  getRegistry(): Registry {
    return this.registry;
  }

  incrementHttpRequests(method: string, route: string, statusCode: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  observeHttpDuration(method: string, route: string, durationSeconds: number): void {
    this.httpRequestDuration.observe({ method, route }, durationSeconds);
  }

  setActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  setScheduledTasks(count: number): void {
    this.scheduledTasks.set(count);
  }

  incrementAiRequests(provider: string, operation: string, status: 'success' | 'error'): void {
    this.aiRequestsTotal.inc({ provider, operation, status });
  }

  observeAiDuration(provider: string, operation: string, durationSeconds: number): void {
    this.aiRequestDuration.observe({ provider, operation }, durationSeconds);
  }
}
