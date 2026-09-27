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
import { DeadlinesService } from './deadlines.service';
import { CreateDeadlineRequest, UpdateDeadlineRequest } from './interfaces/deadline.interface';

@Controller('deadlines')
@UseGuards(JwtAuthGuard)
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateDeadlineRequest) {
    return this.deadlinesService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('goalId') goalId?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: number,
    @Query('upcoming') upcoming?: string
  ) {
    return this.deadlinesService.findAll(req.user.id, {
      status,
      goalId,
      projectId,
      limit: limit ? parseInt(limit.toString()) : undefined,
      upcoming: upcoming === 'true',
    });
  }

  @Get('upcoming')
  async getUpcoming(@Request() req, @Query('days') days?: number) {
    return this.deadlinesService.getUpcoming(req.user.id, days || 7);
  }

  @Get('overdue')
  async getOverdue(@Request() req) {
    return this.deadlinesService.getOverdue(req.user.id);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.deadlinesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateDeadlineRequest) {
    return this.deadlinesService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.deadlinesService.delete(req.user.id, id);
  }
}
