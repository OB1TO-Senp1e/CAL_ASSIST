import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { GoogleMapsTravelTimeProvider } from './google-maps.provider';
import {
  TravelTimeRequestSchema,
  PlaceSearchRequestSchema,
  GeocodeRequestSchema,
  TravelTimeRequest,
  TravelTimeResult,
  PlaceSearchRequest,
} from './travel-time.interface';

/**
 * Travel-time HTTP surface.
 *
 *   POST /api/travel/estimate                 origin -> destination travel time
 *   POST /api/travel/search                   place autocomplete/search
 *   POST /api/travel/geocode                  address -> coordinates
 *   GET  /api/travel/status                   whether a provider is configured
 *
 * Previously no controller existed at all, so the client had to hard-throw
 * "No travel-time HTTP controller is available in the current API."
 */
@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelTimeController {
  constructor(private readonly provider: GoogleMapsTravelTimeProvider) {}

  @Get('status')
  status() {
    const configured = this.provider.isConfigured;
    return {
      provider: this.provider.provider,
      providerName: this.provider.providerName,
      configured,
      rateLimit: this.provider.getRateLimit(),
    };
  }

  @Post('estimate')
  async estimate(@Body() body: TravelTimeRequest): Promise<TravelTimeResult> {
    const request = TravelTimeRequestSchema.parse(body);
    if (!request.origin.address && request.origin.latitude === undefined) {
      throw new BadRequestException('origin requires an address or coordinates');
    }
    if (!request.destination.address && request.destination.latitude === undefined) {
      throw new BadRequestException('destination requires an address or coordinates');
    }
    return this.provider.getTravelTime(request);
  }

  @Post('search')
  async searchPlaces(@Body() body: PlaceSearchRequest) {
    const request = PlaceSearchRequestSchema.parse(body ?? {});
    return this.provider.searchPlaces(request);
  }

  @Post('geocode')
  async geocode(@Body() body: unknown) {
    const request = GeocodeRequestSchema.parse(body ?? {});
    return this.provider.geocode(request);
  }

  @Get('place/:placeId')
  async placeDetails(@Request() req, @Param('placeId') placeId: string) {
    void req;
    return this.provider.getPlaceDetails(placeId);
  }

  @Get('reverse')
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng must be numbers');
    }
    return this.provider.reverseGeocode(latitude, longitude);
  }
}
