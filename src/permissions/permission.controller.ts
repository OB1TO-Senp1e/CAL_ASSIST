import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionService } from './permission.service';
import {
  PermissionAction,
  PermissionScope,
  PermissionCheckInput,
  AutonomyPolicy,
  UndoRequest,
} from './permission.types';

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post('check')
  async checkPermission(@Request() req, @Body() body: PermissionCheckInput) {
    return this.permissionService.checkPermission({ ...body, userId: req.user.id });
  }

  @Get('permissions')
  async getUserPermissions(
    @Request() req,
    @Query('action') action?: PermissionAction,
    @Query('scope') scope?: PermissionScope,
  ) {
    return this.permissionService.getUserPermissions(req.user.id, action, scope);
  }

  @Post('permissions')
  async grantPermission(
    @Request() req,
    @Body() body: Omit<import('./permission.types').UserPermission, 'id' | 'grantedAt' | 'isActive'>,
  ) {
    return this.permissionService.grantPermission(req.user.id, body);
  }

  @Delete('permissions/:id')
  async revokePermission(@Request() req, @Param('id') id: string) {
    await this.permissionService.revokePermission(req.user.id, id);
    return { success: true };
  }

  @Get('autonomy-policies')
  async getAutonomyPolicies(@Request() req) {
    return this.permissionService.getAutonomyPolicies(req.user.id);
  }

  @Get('autonomy-policies/active')
  async getActivePolicy(@Request() req) {
    return this.permissionService.getActiveAutonomyPolicy(req.user.id);
  }

  @Post('autonomy-policies')
  async createPolicy(
    @Request() req,
    @Body() body: Omit<import('./permission.types').AutonomyPolicy, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ) {
    return this.permissionService.createAutonomyPolicy(req.user.id, body);
  }

  @Put('autonomy-policies/:id')
  async updatePolicy(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Partial<import('./permission.types').AutonomyPolicy>,
  ) {
    return this.permissionService.updateAutonomyPolicy(req.user.id, id, body);
  }

  @Delete('autonomy-policies/:id')
  async deletePolicy(@Request() req, @Param('id') id: string) {
    await this.permissionService.deleteAutonomyPolicy(req.user.id, id);
    return { success: true };
  }

  @Post('apply-template')
  async applyTemplate(@Request() req, @Body() body: { templateId: string }) {
    await this.permissionService.applyTemplate(req.user.id, body.templateId);
    return { success: true };
  }

  @Get('templates')
  async getTemplates() {
    return this.permissionService.getTemplates();
  }

  @Post('undo')
  async undoAction(@Request() req, @Body() body: UndoRequest) {
    return this.permissionService.undoAction(req.user.id, body);
  }

  @Get('audit')
  async getAuditHistory(
    @Request() req,
    @Query('action') action?: string,
    @Query('scope') scope?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.permissionService.getAuditHistory(req.user.id, {
      action: action as any,
      scope: scope as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }
}