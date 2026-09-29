import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

export interface GoogleProfile {
  email: string;
  name?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID', ''),
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET', ''),
      callbackURL: config.get<string>(
        'GOOGLE_LOGIN_CALLBACK_URL',
        'http://localhost:3000/auth/google/callback'
      ),
      scope: ['openid', 'email', 'profile'],
      state: true,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.find((entry) => entry.value)?.value;
    if (!email || profile._json.email_verified === false) {
      throw new UnauthorizedException('Google account email could not be verified');
    }

    return { email: email.toLowerCase(), name: profile.displayName || undefined };
  }
}
