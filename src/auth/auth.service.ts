import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../common/services/prisma.service';

export interface JwtPayload {
  email: string;
  sub: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.validatePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload: JwtPayload = { email: user.email, sub: user.id };

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token: await this.jwtService.signAsync(payload),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      access_token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    } as AuthResponse;
  }

  async register(email: string, password: string, name?: string) {
    const user = await this.usersService.create({
      email,
      password,
      name,
    });

    return user;
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({
      where: { token },
    });
    return { success: true };
  }

  private async validatePassword(password: string, passwordHash: string): Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, passwordHash);
  }
}
