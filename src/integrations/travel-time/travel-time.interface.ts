import { z } from 'zod';

export const TravelModeSchema = z
  .union([
    z.enum(['DRIVING', 'WALKING', 'BICYCLING', 'TRANSIT', 'FLIGHT']),
    z.enum(['driving', 'walking', 'bicycling', 'transit', 'flight']),
  ])
  .transform(
    (value) => value.toUpperCase() as 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' | 'FLIGHT'
  );

export type TravelMode = z.infer<typeof TravelModeSchema>;

export const LocationSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  placeId: z.string().optional(),
  name: z.string().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

export const TravelTimeRequestSchema = z.object({
  origin: LocationSchema,
  destination: LocationSchema,
  mode: TravelModeSchema.default('DRIVING'),
  departureTime: z.string().datetime().optional(),
  arrivalTime: z.string().datetime().optional(),
  avoidTolls: z.boolean().default(false),
  avoidHighways: z.boolean().default(false),
  avoidFerries: z.boolean().default(false),
});

export type TravelTimeRequest = z.infer<typeof TravelTimeRequestSchema>;

export const TravelTimeResultSchema = z.object({
  durationMinutes: z.number().int().positive(),
  durationInTrafficMinutes: z.number().int().positive().optional(),
  distanceMeters: z.number().int().positive().optional(),
  distanceKilometers: z.number().optional(),
  startAddress: z.string().optional(),
  endAddress: z.string().optional(),
  steps: z
    .array(
      z.object({
        instruction: z.string(),
        distanceMeters: z.number(),
        durationMinutes: z.number(),
        polyline: z.string().optional(),
      })
    )
    .optional(),
  polyline: z.string().optional(),
  trafficModel: z.enum(['BEST_GUESS', 'PESSIMISTIC', 'OPTIMISTIC']).optional(),
  warnings: z.array(z.string()).optional(),
  provider: z.string(),
});

export type TravelTimeResult = z.infer<typeof TravelTimeResultSchema>;

export const RouteMatrixRequestSchema = z.object({
  origins: z.array(LocationSchema),
  destinations: z.array(LocationSchema),
  mode: TravelModeSchema.default('DRIVING'),
  departureTime: z.string().datetime().optional(),
});

export type RouteMatrixRequest = z.infer<typeof RouteMatrixRequestSchema>;

export const RouteMatrixResultSchema = z.object({
  rows: z.array(
    z.array(
      z.object({
        durationMinutes: z.number().int().positive(),
        distanceMeters: z.number().int().positive(),
        status: z.enum([
          'OK',
          'ZERO_RESULTS',
          'NOT_FOUND',
          'MAX_ROUTE_LENGTH_EXCEEDED',
          'MAX_WAYPOINTS_EXCEEDED',
          'INVALID_REQUEST',
          'OVER_DAILY_LIMIT',
          'OVER_QUERY_LIMIT',
          'REQUEST_DENIED',
          'UNKNOWN_ERROR',
        ]),
      })
    )
  ),
  provider: z.string(),
});

export type RouteMatrixResult = z.infer<typeof RouteMatrixResultSchema>;

export const PlaceDetailsSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  types: z.array(z.string()),
  phoneNumber: z.string().optional(),
  website: z.string().optional(),
  openingHours: z.array(z.string()).optional(),
  rating: z.number().optional(),
  photos: z.array(z.string()).optional(),
});

export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;

export const PlaceSearchRequestSchema = z.object({
  query: z.string().optional(),
  location: LocationSchema.optional(),
  radius: z.number().int().positive().optional(),
  type: z.string().optional(),
  keyword: z.string().optional(),
  minPrice: z.number().min(0).max(4).optional(),
  maxPrice: z.number().min(0).max(4).optional(),
  openNow: z.boolean().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
});

export type PlaceSearchRequest = z.infer<typeof PlaceSearchRequestSchema>;

export const PlaceSearchResultSchema = z.object({
  places: z.array(PlaceDetailsSchema),
  nextPageToken: z.string().optional(),
  provider: z.string(),
});

export type PlaceSearchResult = z.infer<typeof PlaceSearchResultSchema>;

export const GeocodeRequestSchema = z.object({
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  placeId: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
});

export type GeocodeRequest = z.infer<typeof GeocodeRequestSchema>;

export const GeocodeResultSchema = z.object({
  results: z.array(
    z.object({
      formattedAddress: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      placeId: z.string(),
      types: z.array(z.string()),
      addressComponents: z
        .array(
          z.object({
            longName: z.string(),
            shortName: z.string(),
            types: z.array(z.string()),
          })
        )
        .optional(),
      geometry: z
        .object({
          location: z.object({
            lat: z.number(),
            lng: z.number(),
          }),
          viewport: z
            .object({
              northeast: z.object({ lat: z.number(), lng: z.number() }),
              southwest: z.object({ lat: z.number(), lng: z.number() }),
            })
            .optional(),
        })
        .optional(),
    })
  ),
  provider: z.string(),
});

export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

export interface TravelTimeProvider {
  readonly providerName: string;
  readonly provider: string;

  getTravelTime(request: TravelTimeRequest): Promise<TravelTimeResult>;
  getRouteMatrix(request: RouteMatrixRequest): Promise<RouteMatrixResult>;
  geocode(request: GeocodeRequest): Promise<GeocodeResult>;
  reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult>;
  searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult>;
  getPlaceDetails(placeId: string): Promise<PlaceDetails>;

  // Provider-specific config
  getRateLimit(): { requestsPerSecond: number; requestsPerDay: number };
  getQuotaInfo(): { used: number; limit: number; resetAt: Date };
}

export interface TravelTimeProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  language?: string;
}
