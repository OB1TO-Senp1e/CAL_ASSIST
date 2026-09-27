import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommitmentEngineService } from './commitment-engine.service';
import {
  CreateCommitmentInput,
  UpdateCommitmentInput,
  SearchCommitmentsInput,
  ExtractCommitmentsInput,
} from './commitment.types';

@Controller('commitments')
@UseGuards(JwtAuthGuard)
export class CommitmentEngineController {
  constructor(private readonly commitmentEngineService: CommitmentEngineService) {}

  @Post()
  async createCommitment(@Request() req, @Body() body: CreateCommitmentInput) {
    return this.commitmentEngineService.createCommitment(req.user.id, body);
  }

  @Get()
  async searchCommitments(@Request() req, @Query() query: SearchCommitmentsInput) {
    return this.commitmentEngineService.searchCommitments(req.user.id, query);
  }

  @Get('stats')
  async getStats(@Request() req) {
    return this.commitmentEngineService.getCommitmentStats(req.user.id);
  }

  @Get('risks')
  async getRisks(@Request() req) {
    return this.commitmentEngineService.getCommitmentRisks(req.user.id);
  }

  @Post('assess-risks')
  async assessAllRisks(@Request() req) {
    return this.commitmentEngineService.assessAllRisks(req.user.id);
  }

  @Get(':id')
  async getCommitment(@Request() req, @Param('id') id: string) {
    return this.commitmentEngineService.getCommitment(req.user.id, id);
  }

  @Get(':id/risk')
  async getCommitmentRisk(@Request() req, @Param('id') id: string) {
    return this.commitmentEngineService.getCommitmentRisk(req.user.id, id);
  }

  @Put(':id')
  async updateCommitment(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Omit<UpdateCommitmentInput, 'id'>,
  ) {
    return this.commitmentEngineService.updateCommitment(req.user.id, { ...body, id });
  }

  @Delete(':id')
  async deleteCommitment(@Request() req, @Param('id') id: string) {
    await this.commitmentEngineService.deleteCommitment(req.user.id, id);
    return { success: true };
  }

  @Post('extract')
  async extractCommitments(@Request() req, @Body() body: ExtractCommitmentsInput) {
    return this.commitmentEngineService.extractCommitments(req.user.id, body);
  }

  @Post('send-reminders')
  async sendReminders(@Request() req) {
    const count = await this.commitmentEngineService.sendReminders(req.user.id);
    return { remindersSent: count };
  }
}