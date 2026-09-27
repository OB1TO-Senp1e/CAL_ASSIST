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
import { MilestonesService } from './milestones.service';
import { CreateMilestoneRequest, UpdateMilestoneRequest } from './interfaces/milestone.interface';

@Controller('milestones')
@UseGuards(JwtAuthGuard)
export class MilestonesController {
  constructor(private readonly milestonesService: MilestonesService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateMilestoneRequest) {
    return this.milestonesService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('goalId') goalId?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: number
  ) {
    return this.milestonesService.findAll(req.user.id, {
      status,
      goalId,
      projectId,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.milestonesService.findOne(req.user.id, id);
  }

  @Get(':id/progress')
  async getProgress(@Request() req, @Param('id') id: string) {
    return this.milestonesService.getProgress(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateMilestoneRequest) {
    return this.milestonesService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.milestonesService.delete(req.user.id, id);
  }
}
