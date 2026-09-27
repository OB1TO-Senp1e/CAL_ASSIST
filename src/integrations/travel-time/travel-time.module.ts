import { Module } from '@nestjs/common';
import { GoogleMapsTravelTimeProvider } from './google-maps.provider';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [GoogleMapsTravelTimeProvider],
  exports: [GoogleMapsTravelTimeProvider],
})
export class TravelTimeModule {}