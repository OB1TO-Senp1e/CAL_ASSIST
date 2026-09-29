import { Module } from '@nestjs/common';
import { GoogleMapsTravelTimeProvider } from './google-maps.provider';
import { ConfigModule } from '@nestjs/config';
import { TravelTimeController } from './travel-time.controller';

@Module({
  imports: [ConfigModule],
  controllers: [TravelTimeController],
  providers: [GoogleMapsTravelTimeProvider],
  exports: [GoogleMapsTravelTimeProvider],
})
export class TravelTimeModule {}
