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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AccountDeletionService } from './account-deletion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountDeletion: AccountDeletionService
  ) {}

  @Get('me')
  async getProfile(@Request() req) {
    return this.usersService.findById(req.user.id);
  }

  /**
   * C4 — self-service account deletion. Explicit confirmation required: the
   * JSON body must echo the caller's own email ("confirm"). Static 'me' route
   * is declared before the dynamic ':id' routes on purpose.
   */
  @Delete('me')
  async deleteOwnAccount(
    @Request() req,
    @Body() body: { confirm?: string }
  ) {
    await this.accountDeletion.requestDeleteBySelf(req.user.id, body?.confirm ?? '');
    return { success: true, message: 'Account and all associated data deleted.' };
  }

  @Get()
  async findAll() {
    return this.usersService['prisma'].user.findMany();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body) {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
