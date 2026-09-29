export interface ProxyAwareApplication {
  getHttpAdapter(): { getInstance(): { set(setting: string, value: unknown): void } };
  enableShutdownHooks(): void;
}

export function configureProxyTrust(app: ProxyAwareApplication): void {
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.enableShutdownHooks();
}
