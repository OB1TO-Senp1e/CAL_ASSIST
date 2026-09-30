import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DevelopmentOnlyGuard } from './development-only.guard';

describe('DevelopmentOnlyGuard', () => {
  it('allows development-only routes outside production', () => {
    const guard = new DevelopmentOnlyGuard({
      get: () => 'development',
    } as unknown as ConfigService);

    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('hides development-only routes in production', () => {
    const guard = new DevelopmentOnlyGuard({
      get: () => 'production',
    } as unknown as ConfigService);

    expect(() => guard.canActivate({} as never)).toThrow(NotFoundException);
  });
});
