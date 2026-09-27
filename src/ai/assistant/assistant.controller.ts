import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';
import { ToolRegistry } from './tool-registry.service';
import { PrismaService } from '../../common/services/prisma.service';
import {
  ConfirmationRequestSchema,
  ProposedAction,
  ToolCall,
} from './interfaces/assistant-tools.interface';

/**
 * HTTP surface for the assistant.
 *
 * Endpoints called by client/src/services/assistant.ts:
 *
 *   POST   /api/assistant/message
 *   POST   /api/assistant/confirm
 *   GET    /api/assistant/conversations
 *   GET    /api/assistant/conversations/:id/messages
 *   POST   /api/assistant/conversations
 *   PATCH  /api/assistant/conversations/:id
 *   DELETE /api/assistant/conversations/:id
 *   GET    /api/assistant/tools
 *   GET    /api/assistant/recommendations
 *
 * All routes are user-scoped through the JWT id. Message bodies are plain
 * natural language; the orchestrator owns conversation persistence so a
 * thread survives reload.
 */
const SendMessageSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
});

const ConfirmBodySchema = ConfirmationRequestSchema.extend({
  conversationId: z.string().optional(),
});

interface SendMessageResult {
  id: string;
  conversationId: string | null;
  role: 'ASSISTANT';
  content: string;
  reasoning: string | null;
  tokensUsed: number | null;
  modelOutput: {
    confidence: number | null;
    proposedActions: ProposedAction[] | null;
    toolCalls: ToolCall[] | null;
  } | null;
  createdAt: string;
  proposedActions?: ProposedAction[];
  toolCalls?: ToolCall[];
  requiresConfirmation?: boolean;
  confidence?: number;
}

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly toolRegistry: ToolRegistry,
    private readonly prisma: PrismaService
  ) {}

  @Post('message')
  async message(@Request() req, @Body() body: unknown): Promise<SendMessageResult> {
    const parsed = SendMessageSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return {
        id: `assistant_${Date.now()}`,
        conversationId: null,
        role: 'ASSISTANT',
        content: 'I could not understand that request.',
        reasoning: null,
        tokensUsed: null,
        modelOutput: null,
        createdAt: new Date().toISOString(),
        confidence: 0,
      };
    }

    const { conversationId, message } = parsed.data;
    const result = await this.orchestrator.processMessage(
      req.user.id,
      message,
      conversationId
    );

    const latest = await this.prisma.conversationMessage.findFirst({
      where: { userId: req.user.id, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, conversationId: true },
    });

    return {
      id: latest?.id ?? `assistant_${Date.now()}`,
      conversationId: latest?.conversationId ?? conversationId ?? null,
      role: 'ASSISTANT',
      content: result.message,
      reasoning: null,
      tokensUsed: null,
      modelOutput: {
        confidence: result.confidence ?? null,
        proposedActions: result.proposedActions ?? null,
        toolCalls: result.toolCalls ?? null,
      },
      createdAt: new Date().toISOString(),
      ...result,
    };
  }

  @Post('confirm')
  async confirm(@Request() req, @Body() body: unknown) {
    const parsed = ConfirmBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return { message: 'Invalid confirm request.', confidence: 0 };
    }
    const { actionId, confirmed, modifiedInput } = parsed.data;
    return this.orchestrator.confirmAction(
      req.user.id,
      actionId,
      confirmed,
      modifiedInput
    );
  }

  @Get('conversations')
  async listConversations(@Request() req) {
    return this.prisma.conversation.findMany({
      where: { userId: req.user.id },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  @Get('conversations/:id/messages')
  async listMessages(@Request() req, @Param('id') id: string) {
    return this.prisma.conversationMessage.findMany({
      where: { conversationId: id, userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('conversations')
  async createConversation(@Request() req, @Body() body: { title?: string }) {
    return this.prisma.conversation.create({
      data: {
        userId: req.user.id,
        title: body?.title ?? null,
        lastMessageAt: new Date(),
      },
    });
  }

  @Patch('conversations/:id')
  async renameConversation(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { title?: string }
  ) {
    return this.prisma.conversation.updateMany({
      where: { id, userId: req.user.id },
      data: { title: body?.title ?? null },
    });
  }

  @Delete('conversations/:id')
  async deleteConversation(@Request() req, @Param('id') id: string) {
    await this.prisma.$transaction([
      this.prisma.conversationMessage.deleteMany({
        where: { conversationId: id, userId: req.user.id },
      }),
      this.prisma.assistantRecommendation.updateMany({
        where: { conversationId: id, userId: req.user.id },
        data: { conversationId: null },
      }),
      this.prisma.conversation.deleteMany({
        where: { id, userId: req.user.id },
      }),
    ]);
  }

  @Get('tools')
  listTools() {
    return this.toolRegistry.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      confirmationLevel: tool.confirmationLevel,
    }));
  }

  @Get('recommendations')
  async recommendations(@Request() req) {
    return this.prisma.assistantRecommendation.findMany({
      where: { userId: req.user.id, status: 'PENDING' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }
}