import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Get,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './local-auth.guard';
import { PrismaService } from '../common/services/prisma.service';
import { GoogleAuthGuard } from './google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService
  ) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Request() req, @Res() response: Response) {
    const session = await this.authService.loginWithGoogle(req.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    response.redirect(`${frontendUrl}/login#access_token=${encodeURIComponent(session.access_token)}`);
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string; name?: string }) {
    try {
      return await this.authService.register(body.email, body.password, body.name);
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  }

  @Post('logout')
  async logout(@Request() req) {
    return this.authService.logout(req.headers.authorization?.split(' ')[1]);
  }

  @Get('test-user')
  async createTestUser() {
    try {
      const user = await this.usersService.create({
        email: 'test@example.com',
        password: 'testpassword123',
        name: 'Test User',
      });
      return { success: true, user };
    } catch (error) {
      const err = error as Error;
      console.error('Test user error:', err);
      return { success: false, error: err.message, stack: err.stack };
    }
  }

  @Get('test-user-direct')
  async createTestUserDirect() {
    try {
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash('testpassword123', 12);

      const user = await this.prisma.user.create({
        data: {
          email: 'testdirect@example.com',
          name: 'Test Direct',
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return { success: true, user };
    } catch (error) {
      const err = error as Error;
      console.error('Test user direct error:', err);
      return { success: false, error: err.message, stack: err.stack };
    }
  }

  @Get('test-user-no-bcrypt')
  async createTestUserNoBcrypt() {
    try {
      // Test without bcrypt - just use a plain hash
      const user = await this.prisma.user.create({
        data: {
          email: 'testnobcrypt@example.com',
          name: 'Test No Bcrypt',
          passwordHash: 'plain-test-hash',
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return { success: true, user };
    } catch (error) {
      const err = error as Error;
      console.error('Test user no bcrypt error:', err);
      return { success: false, error: err.message, stack: err.stack };
    }
  }
}
