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
import { TimeBlocksService } from './time-blocks.service';
import { CreateTimeBlockRequest, UpdateTimeBlockRequest } from './interfaces/time-block.interface';

@Controller('time-blocks')
@UseGuards(JwtAuthGuard)
export class TimeBlocksController {
  constructor(private readonly timeBlocksService: TimeBlocksService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateTimeBlockRequest) {
    return this.timeBlocksService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('blockType') blockType?: string,
    @Query('limit') limit?: number
  ) {
    return this.timeBlocksService.findAll(req.user.id, {
      startDate,
      endDate,
      blockType,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.timeBlocksService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateTimeBlockRequest) {
    return this.timeBlocksService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.timeBlocksService.delete(req.user.id, id);
  }
}
