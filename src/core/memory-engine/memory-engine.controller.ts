import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MemoryEngineService } from './memory-engine.service';
import {
  CreateMemoryInput,
  UpdateMemoryInput,
  SearchMemoryInput,
  BulkMemoryAction,
} from './memory.types';

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryEngineController {
  constructor(private readonly memoryEngineService: MemoryEngineService) {}

  @Post()
  async createMemory(@Request() req, @Body() body: CreateMemoryInput) {
    const memory = await this.memoryEngineService.createMemory(req.user.id, body);
    return { success: true, memory };
  }

  @Get('stats')
  async getStats(@Request() req) {
    return this.memoryEngineService.getMemoryStats(req.user.id);
  }

  @Get('conflicts')
  async getConflicts(@Request() req) {
    return this.memoryEngineService.getConflicts(req.user.id);
  }

  @Put('conflicts/:id/resolve')
  async resolveConflict(
    @Request() req,
    @Param('id') conflictId: string,
    @Body() body: { resolution: 'KEEP_FIRST' | 'KEEP_SECOND' | 'MERGE' | 'DELETE_BOTH' | 'MANUAL' }
  ) {
    await this.memoryEngineService.resolveConflict(req.user.id, conflictId, body.resolution);
    return { success: true };
  }

  @Get('search')
  async searchMemories(@Request() req, @Query() query: SearchMemoryInput) {
    const memories = await this.memoryEngineService.searchMemories(req.user.id, query);
    return { memories };
  }

  @Get(':id')
  async getMemory(@Request() req, @Param('id') id: string) {
    const memory = await this.memoryEngineService.getMemory(req.user.id, id);
    return { memory };
  }

  @Put(':id')
  async updateMemory(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Omit<UpdateMemoryInput, 'id'>
  ) {
    const memory = await this.memoryEngineService.updateMemory(req.user.id, { ...body, id });
    return { success: true, memory };
  }

  @Delete(':id')
  async deleteMemory(
    @Request() req,
    @Param('id') id: string,
    @Query('permanent') permanent?: string
  ) {
    await this.memoryEngineService.deleteMemory(req.user.id, id, permanent === 'true');
    return { success: true };
  }

  @Post('bulk')
  async bulkAction(@Request() req, @Body() body: BulkMemoryAction) {
    const result = await this.memoryEngineService.bulkAction(req.user.id, body);
    return { success: true, ...result };
  }

  @Get('export')
  async exportMemories(@Request() req) {
    const exportData = await this.memoryEngineService.exportMemories(req.user.id);
    return exportData;
  }

  @Post('import')
  async importMemories(@Request() req, @Body() body: { data: any; overwrite?: boolean }) {
    const result = await this.memoryEngineService.importMemories(
      req.user.id,
      body.data,
      body.overwrite
    );
    return { success: true, ...result };
  }
}
