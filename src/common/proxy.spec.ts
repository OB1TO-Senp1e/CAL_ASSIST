import { configureProxyTrust, ProxyAwareApplication } from './proxy';

describe('configureProxyTrust', () => {
  it('trusts only the immediate proxy and enables graceful shutdown hooks', () => {
    const expressApp = { set: jest.fn() };
    const app: ProxyAwareApplication = {
      getHttpAdapter: () => ({ getInstance: () => expressApp }),
      enableShutdownHooks: jest.fn(),
    };

    configureProxyTrust(app);

    expect(expressApp.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
  });
});
