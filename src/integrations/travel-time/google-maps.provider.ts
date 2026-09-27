import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TravelTimeProvider,
  TravelTimeRequest,
  TravelTimeResult,
  RouteMatrixRequest,
  RouteMatrixResult,
  GeocodeRequest,
  GeocodeResult,
  PlaceSearchRequest,
  PlaceSearchResult,
  PlaceDetails,
  TravelMode,
  Location,
  TravelTimeProviderConfig,
} from './travel-time.interface';

@Injectable()
export class GoogleMapsTravelTimeProvider implements TravelTimeProvider {
  private readonly logger = new Logger(GoogleMapsTravelTimeProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api';

  readonly providerName = 'Google Maps';
  readonly provider = 'GOOGLE_MAPS';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('Google Maps API key not configured');
    }
  }

  async getTravelTime(request: TravelTimeRequest): Promise<TravelTimeResult> {
    const origin = this.formatLocation(request.origin);
    const destination = this.formatLocation(request.destination);
    const mode = this.mapTravelMode(request.mode);

    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      key: this.apiKey,
      traffic_model: 'best_guess',
    });
    if (request.departureTime) {
      params.set('departure_time', String(Math.floor(new Date(request.departureTime).getTime() / 1000)));
    }
    if (request.arrivalTime) {
      params.set('arrival_time', String(Math.floor(new Date(request.arrivalTime).getTime() / 1000)));
    }
    const avoid = [
      request.avoidTolls && 'tolls',
      request.avoidHighways && 'highways',
      request.avoidFerries && 'ferries',
    ].filter(Boolean);
    if (avoid.length) params.set('avoid', avoid.join('|'));

    const url = `${this.baseUrl}/directions/json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK' || !data.routes?.length) {
        throw new Error(`Directions API error: ${data.status} - ${data.error_message || 'No routes found'}`);
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      return {
        durationMinutes: Math.round(leg.duration.value / 60),
        durationInTrafficMinutes: leg.duration_in_traffic ? Math.round(leg.duration_in_traffic.value / 60) : undefined,
        distanceMeters: leg.distance.value,
        distanceKilometers: leg.distance.value / 1000,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        steps: leg.steps?.map((step: any) => ({
          instruction: step.html_instructions?.replace(/<[^>]*>/g, '') || '',
          distanceMeters: step.distance.value,
          durationMinutes: Math.round(step.duration.value / 60),
          polyline: step.polyline?.points,
        })),
        polyline: route.overview_polyline?.points,
        trafficModel: 'BEST_GUESS',
        warnings: route.warnings,
        provider: this.provider,
      };
    } catch (error: any) {
      this.logger.error(`Google Maps directions failed: ${error.message}`);
      throw error;
    }
  }

  async getRouteMatrix(request: RouteMatrixRequest): Promise<any> {
    const origins = request.origins.map(o => this.formatLocation(o)).join('|');
    const destinations = request.destinations.map(d => this.formatLocation(d)).join('|');
    const mode = this.mapTravelMode(request.mode);

    const params = new URLSearchParams({ origins, destinations, mode, key: this.apiKey });
    if (request.departureTime) {
      params.set('departure_time', String(Math.floor(new Date(request.departureTime).getTime() / 1000)));
    }

    const url = `${this.baseUrl}/distancematrix/json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Distance Matrix API error: ${data.status} - ${data.error_message}`);
      }

      return {
        rows: data.rows.map((row: any) => row.elements.map((element: any) => ({
          durationMinutes: element.duration ? Math.round(element.duration.value / 60) : null,
          distanceMeters: element.distance ? element.distance.value : null,
          status: element.status,
        }))),
        provider: this.provider,
      };
    } catch (error: any) {
      this.logger.error(`Google Maps distance matrix failed: ${error.message}`);
      throw error;
    }
  }

  async geocode(request: GeocodeRequest): Promise<GeocodeResult> {
    let address = '';
    if (request.address) {
      address = request.address;
    } else if (request.latitude !== undefined && request.longitude !== undefined) {
      address = `${request.latitude},${request.longitude}`;
    } else if (request.placeId) {
      address = `place_id:${request.placeId}`;
    } else {
      throw new Error('Geocode request must include address, coordinates, or placeId');
    }

    const params = new URLSearchParams({
      address,
      key: this.apiKey,
      ...(request.language && { language: request.language }),
      ...(request.region && { region: request.region }),
    });

    const url = `${this.baseUrl}/geocode/json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Geocoding API error: ${data.status} - ${data.error_message}`);
      }

      return {
        results: data.results.map((result: any) => ({
          formattedAddress: result.formatted_address,
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          placeId: result.place_id,
          types: result.types,
          addressComponents: result.address_components?.map((comp: any) => ({
            longName: comp.long_name,
            shortName: comp.short_name,
            types: comp.types,
          })),
          geometry: result.geometry ? {
            location: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
            viewport: result.geometry.viewport ? {
              northeast: { lat: result.geometry.viewport.northeast.lat, lng: result.geometry.viewport.northeast.lng },
              southwest: { lat: result.geometry.viewport.southwest.lat, lng: result.geometry.viewport.southwest.lng },
            } : undefined,
          } : undefined,
        })),
        provider: this.provider,
      };
    } catch (error: any) {
      this.logger.error(`Google Maps geocoding failed: ${error.message}`);
      throw error;
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult> {
    return this.geocode({ latitude, longitude });
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult> {
    const params = new URLSearchParams({ key: this.apiKey });

    if (request.query) params.append('query', request.query);
    if (request.location) params.append('location', `${request.location.latitude},${request.location.longitude}`);
    if (request.radius) params.append('radius', request.radius.toString());
    if (request.type) params.append('type', request.type);
    if (request.keyword) params.append('keyword', request.keyword);
    if (request.minPrice !== undefined) params.append('minprice', request.minPrice.toString());
    if (request.maxPrice !== undefined) params.append('maxprice', request.maxPrice.toString());
    if (request.openNow) params.append('opennow', 'true');
    if (request.language) params.append('language', request.language);
    if (request.region) params.append('region', request.region);

    const url = `${this.baseUrl}/place/textsearch/json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Places API error: ${data.status} - ${data.error_message}`);
      }

      return {
        places: data.results.map((place: any) => ({
          placeId: place.place_id,
          name: place.name,
          formattedAddress: place.formatted_address,
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          types: place.types,
          phoneNumber: place.formatted_phone_number,
          website: place.website,
          openingHours: place.opening_hours?.weekday_text,
          rating: place.rating,
          photos: place.photos?.map((p: any) => p.photo_reference),
        })),
        nextPageToken: data.next_page_token,
        provider: this.provider,
      };
    } catch (error: any) {
      this.logger.error(`Google Maps place search failed: ${error.message}`);
      throw error;
    }
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'name,formatted_address,geometry,types,formatted_phone_number,website,opening_hours,rating,photos',
      key: this.apiKey,
    });

    const url = `${this.baseUrl}/place/details/json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Place Details API error: ${data.status} - ${data.error_message}`);
      }

      const place = data.result;
      return {
        placeId: place.place_id,
        name: place.name,
        formattedAddress: place.formatted_address,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        types: place.types,
        phoneNumber: place.formatted_phone_number,
        website: place.website,
        openingHours: place.opening_hours?.weekday_text,
        rating: place.rating,
        photos: place.photos?.map((p: any) => p.photo_reference),
      };
    } catch (error: any) {
      this.logger.error(`Google Maps place details failed: ${error.message}`);
      throw error;
    }
  }

  getRateLimit(): { requestsPerSecond: number; requestsPerDay: number } {
    return { requestsPerSecond: 50, requestsPerDay: 100000 };
  }

  getQuotaInfo(): { used: number; limit: number; resetAt: Date } {
    return { used: 0, limit: 100000, resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
  }

  private formatLocation(location: Location): string {
    if (location.latitude !== undefined && location.longitude !== undefined) {
      return `${location.latitude},${location.longitude}`;
    }
    if (location.placeId) {
      return `place_id:${location.placeId}`;
    }
    return location.address || location.name || '';
  }

  private mapTravelMode(mode: TravelMode): string {
    switch (mode) {
      case 'WALKING': return 'walking';
      case 'BICYCLING': return 'bicycling';
      case 'TRANSIT': return 'transit';
      case 'FLIGHT': return 'driving'; // Google Maps doesn't have flight mode
      default: return 'driving';
    }
  }
}