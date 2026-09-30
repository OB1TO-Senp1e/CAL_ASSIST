import { parseCorsAllowlist } from './cors';

describe('parseCorsAllowlist', () => {
  it('parses comma-separated origins and removes duplicates', () => {
    expect(
      parseCorsAllowlist(
        'https://app.example.com, http://localhost:3001,https://app.example.com',
        undefined
      )
    ).toEqual(['https://app.example.com', 'http://localhost:3001']);
  });

  it('uses the frontend URL fallback for local development', () => {
    expect(parseCorsAllowlist(undefined, 'http://localhost:3001')).toEqual([
      'http://localhost:3001',
    ]);
  });

  it('rejects wildcard and non-origin URLs', () => {
    expect(() => parseCorsAllowlist('*', undefined)).toThrow(/wildcard/);
    expect(() => parseCorsAllowlist('https://example.com/path', undefined)).toThrow(
      /without paths/
    );
  });
});
