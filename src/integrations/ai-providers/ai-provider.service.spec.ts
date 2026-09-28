import { AiProviderService } from './ai-provider.service';
import { AiProviderError } from './ai-provider.error';
import { AIProviderInterface } from './interfaces/ai-provider.interface';
import { CircuitBreakerRegistry } from './provider-health';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';

/**
 * These exercise the selection chain with hand-built providers rather than real
 * ones: the transport policy is already covered by provider-http.spec, and what
 * matters here is *which* provider gets asked and what the caller sees when
 * nobody can answer.
 */
interface FakeBehaviour {
  generate?: (prompt: string) => Promise<string>;
  embed?: (text: string) => Promise<number[]>;
}

function fakeProvider(name: string, behaviour: FakeBehaviour = {}) {
  const generate = jest.fn(behaviour.generate ?? (async () => `${name} answer`));
  const embed = jest.fn(behaviour.embed ?? (async () => [0.1, 0.2]));
  const provider = {
    providerName: name,
    generate,
    generateStructured: jest.fn(async () => ({ from: name })),
    embed,
    getCapabilities: () => ({
      provider: name,
      chat: true,
      toolCalling: false,
      structuredOutput: false,
      embeddings: true,
      model: `${name}-model`,
    }),
  } as unknown as AIProviderInterface;
  return { provider, generate, embed };
}

function failure(kind: string, retryable: boolean): AiProviderError {
  return new AiProviderError(`${kind} failure`, {
    provider: 'fake',
    kind: kind as never,
    retryable,
  });
}

/**
 * Build the service with a deterministic clock and a low threshold so tripping a
 * breaker takes two failures instead of the production three.
 */
function build(
  openai: AIProviderInterface,
  ollama: AIProviderInterface,
  nemotron: AIProviderInterface,
  failureThreshold = 2
) {
  const registry = new CircuitBreakerRegistry(
    { failureThreshold, cooldownMs: 60000, successThreshold: 1 },
    () => 0
  );
  const service = new AiProviderService(
    openai as unknown as OpenAIProvider,
    ollama as unknown as OllamaProvider,
    nemotron as unknown as NemotronNimProvider,
    undefined,
    registry
  );
  return { service, registry };
}

describe('AiProviderService provider selection', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.AI_CIRCUIT_ENABLED = 'true';
    process.env.AI_RETRY_BASE_DELAY_MS = '0';
    process.env.AI_RETRY_MAX_DELAY_MS = '0';
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('uses OpenAI alone when AI_PROVIDER is openai', async () => {
    process.env.AI_PROVIDER = 'openai';
    const openai = fakeProvider('OpenAI');
    const ollama = fakeProvider('Ollama');
    const { service } = build(
      openai.provider,
      ollama.provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    await expect(service.generate('hi')).resolves.toBe('OpenAI answer');
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('answers from the fallback and then stops calling a tripped primary', async () => {
    process.env.AI_PROVIDER = 'ollama';
    const openai = fakeProvider('OpenAI');
    const ollama = fakeProvider('Ollama', {
      generate: async () => {
        throw failure('network', true);
      },
    });
    const { service, registry } = build(
      openai.provider,
      ollama.provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    await expect(service.generate('a')).resolves.toBe('OpenAI answer');
    await expect(service.generate('b')).resolves.toBe('OpenAI answer');
    expect(ollama.generate).toHaveBeenCalledTimes(2);
    expect(registry.get('Ollama').snapshot().state).toBe('open');

    await expect(service.generate('c')).resolves.toBe('OpenAI answer');
    expect(ollama.generate).toHaveBeenCalledTimes(2);
  });


  it('fails fast with circuit_open when every provider is tripped', async () => {
    process.env.AI_PROVIDER = 'ollama';
    const alwaysFail = async () => {
      throw failure('timeout', true);
    };
    const openai = fakeProvider('OpenAI', { generate: alwaysFail });
    const ollama = fakeProvider('Ollama', { generate: alwaysFail });
    const { service } = build(
      openai.provider,
      ollama.provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    // Both providers take two failures to trip, and both are tried per call.
    await expect(service.generate('1')).rejects.toBeInstanceOf(AiProviderError);
    await expect(service.generate('2')).rejects.toBeInstanceOf(AiProviderError);
    const callsBefore = openai.generate.mock.calls.length + ollama.generate.mock.calls.length;

    const surfaced = await service.generate('3').catch((e) => e);
    expect(surfaced).toBeInstanceOf(AiProviderError);
    expect(surfaced.kind).toBe('circuit_open');
    expect(surfaced.retryable).toBe(true);
    expect(surfaced.message).toMatch(/circuit is open/);
    // Nothing new hit the network once both circuits were open.
    expect(openai.generate.mock.calls.length + ollama.generate.mock.calls.length).toBe(
      callsBefore
    );
  });

  it('never trips a breaker on a 401, because bad credentials are not an outage', async () => {
    process.env.AI_PROVIDER = 'ollama';
    const openai = fakeProvider('OpenAI');
    const ollama = fakeProvider('Ollama', {
      generate: async () => {
        throw failure('auth', false);
      },
    });
    const { service, registry } = build(
      openai.provider,
      ollama.provider,
      fakeProvider('Nemotron-NIM').provider,
      1
    );
    await service.onModuleInit();

    // Threshold 1 would normally trip after a single failure - auth must not.
    for (let i = 0; i < 5; i += 1) {
      await expect(service.generate('hi')).resolves.toBe('OpenAI answer');
    }
    const snapshot = registry.get('Ollama').snapshot();
    expect(snapshot.state).toBe('closed');
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(snapshot.lastFailureKind).toBe('auth');
    expect(ollama.generate).toHaveBeenCalledTimes(5);
  });

  it('surfaces the typed parse error instead of a silent empty answer', async () => {
    process.env.AI_PROVIDER = 'openai';
    const openai = fakeProvider('OpenAI');
    (openai.provider.generateStructured as jest.Mock).mockRejectedValue(failure('parse', false));
    const { service } = build(
      openai.provider,
      fakeProvider('Ollama').provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    const surfaced = await service.generateStructured('give me json').catch((e) => e);
    expect(surfaced).toBeInstanceOf(AiProviderError);
    expect(surfaced.kind).toBe('parse');
  });
});

describe('AiProviderService embed degradation', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.AI_CIRCUIT_ENABLED = 'true';
    process.env.AI_RETRY_BASE_DELAY_MS = '0';
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('throws rather than returning [] when every provider fails', async () => {
    process.env.AI_PROVIDER = 'openai';
    const openai = fakeProvider('OpenAI', {
      embed: async () => {
        throw failure('network', true);
      },
    });
    const { service } = build(
      openai.provider,
      fakeProvider('Ollama').provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    const surfaced = await service.embed('query').catch((e) => e);
    expect(surfaced).toBeInstanceOf(AiProviderError);
    expect(Array.isArray(surfaced)).toBe(false);
  });

  it('uses the fallback provider when the primary has no embeddings', async () => {
    process.env.AI_PROVIDER = 'ollama';
    const withoutEmbed = fakeProvider('Ollama', {
      embed: async () => {
        throw failure('unsupported', false);
      },
    });
    const openai = fakeProvider('OpenAI', { embed: async () => [0.5, 0.5] });
    const { service } = build(
      openai.provider,
      withoutEmbed.provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    await expect(service.embed('query')).resolves.toEqual([0.5, 0.5]);
    expect(openai.embed).toHaveBeenCalledTimes(1);
  });

  it('exposes breaker and capability state for health reporting', async () => {
    process.env.AI_PROVIDER = 'openai';
    const openai = fakeProvider('OpenAI');
    const { service } = build(
      openai.provider,
      fakeProvider('Ollama').provider,
      fakeProvider('Nemotron-NIM').provider
    );
    await service.onModuleInit();

    const view = service.describeProviders();
    expect(view[0].provider).toBe('OpenAI');
    expect(view[0].circuit.state).toBe('closed');
    expect(view[0].capabilities?.embeddings).toBe(true);
  });
});

