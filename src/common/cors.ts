export function parseCorsAllowlist(
  configuredOrigins: string | undefined,
  fallbackOrigin: string | undefined
): string[] {
  const value = configuredOrigins ?? fallbackOrigin ?? 'http://localhost:3001';
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin');
  }

  return [
    ...new Set(
      origins.map((origin) => {
        if (origin === '*') {
          throw new Error('CORS_ALLOWED_ORIGINS must not contain a wildcard');
        }

        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new Error('CORS_ALLOWED_ORIGINS must contain valid HTTP(S) origins');
        }

        if (
          (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.pathname !== '/' ||
          parsed.search ||
          parsed.hash ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error('CORS_ALLOWED_ORIGINS entries must be HTTP(S) origins without paths');
        }

        return parsed.origin;
      })
    ),
  ];
}
