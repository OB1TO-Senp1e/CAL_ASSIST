import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { GoalsModule } from './goals/goals.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { EventsModule } from './events/events.module';
import { TimeBlocksModule } from './time-blocks/time-blocks.module';
import { CommitmentsModule } from './commitments/commitments.module';
import { MilestonesModule } from './milestones/milestones.module';
import { DeadlinesModule } from './deadlines/deadlines.module';
import { IntentModule } from './ai/intent/intent.module';
import { PlanningModule } from './ai/planning/planning.module';
import { SchedulingEngineModule } from './scheduling/scheduling-engine/scheduling-engine.module';
import { RealityEngineModule } from './scheduling/reality-engine/reality-engine.module';
import { ReplanningEngineModule } from './scheduling/replanning-engine/replanning-engine.module';
import { RulesEngineModule } from './scheduling/rules-engine/rules-engine.module';
import { TimeCompilerModule } from './scheduling/time-compiler/time-compiler.module';
import { ContextEngineModule } from './core/context-engine/context-engine.module';
import { MemoryEngineModule } from './core/memory-engine/memory-engine.module';
import { CalendarModule } from './calendar/calendar.module';
import { CalendarAdaptersModule } from './integrations/calendar-adapters/calendar-adapters.module';
import { NotificationModule } from './integrations/notification-service/notification.module';
import { AssistantModule } from './ai/assistant/assistant.module';
import { MetricsModule } from './metrics/metrics.module';
import { ProactiveAssistantModule } from './ai/proactive/proactive.module';
import { TravelTimeModule } from './integrations/travel-time/travel-time.module';
import { MeetingIntelligenceModule } from './meetings/meeting-intelligence.module';
import { DailyExperienceModule } from './daily-experience/daily-experience.module';
import { PermissionModule } from './permissions/permission.module';
import { SimulationEngineModule } from './scheduling/simulation-engine/simulation-engine.module';
import { LoggingModule } from './common/logging/logging.module';
import { PrismaService } from './common/services/prisma.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Caching with Redis
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        store: 'redis',
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
        ttl: config.get<number>('CACHE_TTL', 300000),
        max: config.get<number>('CACHE_MAX', 1000),
      }),
      inject: [ConfigService],
    }),

    // Background Jobs with BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),

    // Health Checks
    TerminusModule,

    // Metrics
    MetricsModule,

    // Logging
    LoggingModule,

    // Proactive Assistant
    ProactiveAssistantModule,
    PermissionModule,
    TravelTimeModule,
    MeetingIntelligenceModule,
    DailyExperienceModule,
    SimulationEngineModule,

    // Feature Modules
    UsersModule,
    AuthModule,
    GoalsModule,
    ProjectsModule,
    TasksModule,
    MilestonesModule,
    DeadlinesModule,
    EventsModule,
    TimeBlocksModule,
    CommitmentsModule,
    IntentModule,
    PlanningModule,
    SchedulingEngineModule,
    RealityEngineModule,
    ReplanningEngineModule,
    RulesEngineModule,
    TimeCompilerModule,
    ContextEngineModule,
    MemoryEngineModule,
    CalendarModule,
    CalendarAdaptersModule,
    NotificationModule,
    AssistantModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
