import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';
import { IntentParserService } from '../../ai/intent/intent-parser.service';
import { TimeCompilerService } from '../../scheduling/time-compiler/time-compiler.service';
import { ToolRegistry } from './tool-registry.service';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';
import { CreateEventTool } from './tools/create-event.tool';
import { UpdateEventTool } from './tools/update-event.tool';
import { DeleteEventTool } from './tools/delete-event.tool';
import { MoveEventTool } from './tools/move-event.tool';
import { FindAvailabilityTool } from './tools/find-availability.tool';
import { CreateTaskTool } from './tools/create-task.tool';
import { UpdateTaskTool } from './tools/update-task.tool';
import { CreateGoalTool } from './tools/create-goal.tool';
import { CreateProjectTool } from './tools/create-project.tool';
import { CreateScheduleProposalTool } from './tools/create-schedule-proposal.tool';
import { DetectConflictsTool } from './tools/detect-conflicts.tool';
import { ExplainScheduleTool } from './tools/explain-schedule.tool';
import { PlanDayTool } from './tools/plan-day.tool';

@Module({
  imports: [AiProvidersModule],
  providers: [
    PrismaService,
    IntentParserService,
    TimeCompilerService,
    ToolRegistry,
    AssistantOrchestratorService,
    CreateEventTool,
    UpdateEventTool,
    DeleteEventTool,
    MoveEventTool,
    FindAvailabilityTool,
    CreateTaskTool,
    UpdateTaskTool,
    CreateGoalTool,
    CreateProjectTool,
    CreateScheduleProposalTool,
    DetectConflictsTool,
    ExplainScheduleTool,
    PlanDayTool,
  ],
  exports: [AssistantOrchestratorService, ToolRegistry],
})
export class AssistantModule {}
