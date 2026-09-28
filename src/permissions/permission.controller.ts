import { Controller, Get, Post, Put, Delete, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PermissionService } from './permission.service';
import {
  PermissionAction,
  PermissionScope,
  UndoRequest,
  CheckPermissionInputSchema,
  CheckPermissionInput,
  GrantPermissionInputSchema,
  GrantPermissionInput,
  CreateAutonomyPolicyInputSchema,
  CreateAutonomyPolicyInput,
  UpdateAutonomyPolicyInputSchema,
  UpdateAutonomyPolicyInput,
  ApplyTemplateInputSchema,
  ApplyTemplateInput,
  UndoActionInputSchema,
  UndoActionInput,
} from './permission.types';

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post('check')
  async checkPermission(
    @Request() req,
    @Body(new ZodValidationPipe(CheckPermissionInputSchema)) body: CheckPermissionInput,
  ) {
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
    @Body(new ZodValidationPipe(GrantPermissionInputSchema)) body: GrantPermissionInput,
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
    @Body(new ZodValidationPipe(CreateAutonomyPolicyInputSchema)) body: CreateAutonomyPolicyInput,
  ) {
    return this.permissionService.createAutonomyPolicy(req.user.id, body);
  }

  @Put('autonomy-policies/:id')
  async updatePolicy(
    @Request() req,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAutonomyPolicyInputSchema)) body: UpdateAutonomyPolicyInput,
  ) {
    return this.permissionService.updateAutonomyPolicy(req.user.id, id, body);
  }

  @Delete('autonomy-policies/:id')
  async deletePolicy(@Request() req, @Param('id') id: string) {
    await this.permissionService.deleteAutonomyPolicy(req.user.id, id);
    return { success: true };
  }

  @Post('apply-template')
  async applyTemplate(
    @Request() req,
    @Body(new ZodValidationPipe(ApplyTemplateInputSchema)) body: ApplyTemplateInput,
  ) {
    await this.permissionService.applyTemplate(req.user.id, body.templateId);
    return { success: true };
  }

  @Get('templates')
  async getTemplates() {
    return this.permissionService.getTemplates();
  }

  @Post('undo')
  async undoAction(
    @Request() req,
    @Body(new ZodValidationPipe(UndoActionInputSchema)) body: UndoActionInput,
  ) {
    return this.permissionService.undoAction(req.user.id, {
      ...body,
      userId: req.user.id,
    } satisfies UndoRequest);
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