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
import { TasksService } from './tasks.service';
import { CreateTaskRequest, UpdateTaskRequest } from './interfaces/task.interface';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateTaskRequest) {
    return this.tasksService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('goalId') goalId?: string,
    @Query('projectId') projectId?: string,
    @Query('milestoneId') milestoneId?: string,
    @Query('limit') limit?: number
  ) {
    return this.tasksService.findAll(req.user.id, {
      status,
      goalId,
      projectId,
      milestoneId,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.tasksService.findOne(req.user.id, id);
  }

  @Get(':id/dependencies')
  async getDependencies(@Request() req, @Param('id') id: string) {
    return this.tasksService.getDependencies(req.user.id, id);
  }

  @Get(':id/dependents')
  async getDependents(@Request() req, @Param('id') id: string) {
    return this.tasksService.getDependents(req.user.id, id);
  }

  @Get(':id/can-start')
  async canStart(@Request() req, @Param('id') id: string) {
    return this.tasksService.validateTaskCanStart(req.user.id, id);
  }

  @Get(':id/dependency-chain')
  async getDependencyChain(@Request() req, @Param('id') id: string) {
    return this.tasksService.getDependencyChain(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateTaskRequest) {
    return this.tasksService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.tasksService.delete(req.user.id, id);
  }
}
