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
import { ProjectsService } from './projects.service';
import { CreateProjectRequest, UpdateProjectRequest } from './interfaces/project.interface';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateProjectRequest) {
    return this.projectsService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('goalId') goalId?: string,
    @Query('limit') limit?: number
  ) {
    return this.projectsService.findAll(req.user.id, {
      status,
      goalId,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.id, id);
  }

  @Get(':id/progress')
  async getProgress(@Request() req, @Param('id') id: string) {
    return this.projectsService.getProgress(req.user.id, id);
  }

  @Get(':id/hierarchy')
  async getHierarchy(@Request() req, @Param('id') id: string) {
    return this.projectsService.getHierarchy(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateProjectRequest) {
    return this.projectsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.projectsService.delete(req.user.id, id);
  }
}
