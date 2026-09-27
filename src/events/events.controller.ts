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
import { EventsService } from './events.service';
import { CreateEventRequest, UpdateEventRequest } from './interfaces/event.interface';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateEventRequest) {
    return this.eventsService.create(req.user.id, body);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number
  ) {
    return this.eventsService.findAll(req.user.id, {
      status,
      startDate,
      endDate,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.eventsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() body: UpdateEventRequest) {
    return this.eventsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.eventsService.delete(req.user.id, id);
  }
}
