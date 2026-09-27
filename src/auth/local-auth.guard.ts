import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  override handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new Error(info);
    }
    return user;
  }
}
