import { TravelTimeRequestSchema, RouteMatrixRequestSchema, TravelModeSchema } from './travel-time.interface';

describe('travel time input schemas', () => {
  it('accepts lowercase travel modes from clients', () => {
    expect(TravelModeSchema.parse('driving')).toBe('DRIVING');
    expect(TravelModeSchema.parse('walking')).toBe('WALKING');
    expect(TravelTimeRequestSchema.parse({
      origin: { address: 'Seattle, WA' },
      destination: { address: 'Portland, OR' },
      mode: 'driving',
    }).mode).toBe('DRIVING');
  });

  it('accepts lowercase travel modes for route-matrix requests', () => {
    expect(RouteMatrixRequestSchema.parse({
      origins: [{ address: 'Seattle, WA' }],
      destinations: [{ address: 'Portland, OR' }],
      mode: 'transit',
    }).mode).toBe('TRANSIT');
  });
});
