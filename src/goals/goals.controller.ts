import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoalsService } from './goals.service';
import { CreateGoalRequest, UpdateGoalRequest } from './interfaces/goal.interface';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateGoalRequest) {
    return this.goalsService.create(req.user.id, body);
  }

  @Get()
  async findAll(@Request() req, @Query('status') status?: string, @Query('limit') limit?: number) {
    return this.goalsService.findAll(req.user.id, {
      status,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get('stats')
  async getStats(@Request() req) {
    const goals = await this.goalsService.findAll(req.user.id);
    const stats = {
      total: goals.length,
      completed: goals.filter((g) => g.status === 'COMPLETED').length,
      inProgress: goals.filter((g) => g.status === 'IN_PROGRESS').length,
      pending: goals.filter((g) => g.status === 'PENDING').length,
    };
    return stats;
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.goalsService.findOne(req.user.id, id);
  }

  @Get(':id/progress')
  async getProgress(@Request() req, @Param('id') id: string) {
    return this.goalsService.getProgress(req.user.id, id);
  }

  @Get(':id/hierarchy')
  async getHierarchy(@Request() req, @Param('id') id: string) {
    return this.goalsService.getHierarchy(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateGoalRequest) {
    return this.goalsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.goalsService.delete(req.user.id, id);
  }
}
