import { OpenAIProvider } from './openai.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';
import { AiProviderError } from './ai-provider.error';

/**
 * Stage 5a provider guarantees. The point of these tests is the *shape of
 * failure*: before Stage 5a a dead endpoint produced `''` / `[]` /
 * `{ confidence: 0 }`, all of which callers misread as legitimate answers.
 */
describe('OpenAIProvider Stage 5a behaviour', () => {
  const original = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_MAX_RETRIES = '0';
    process.env.AI_REQUEST_TIMEOUT_MS = '5000';
    delete process.env.AI_PROBE_ENABLED;
    delete process.env.AI_CAP_OPENAI_TOOL_CALLING;
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...original };
  });

  const okChat = (content: string, extra: Record<string, unknown> = {}) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o',
        choices: [{ message: { content }, finish_reason: 'stop' }],
        ...extra,
      }),
      headers: new Headers(),
    }) as unknown as Response;

  it('reports its capability set without touching the network', () => {
    const provider = new OpenAIProvider();
    expect(provider.getCapabilities()).toMatchObject({
      provider: 'openai',
      chat: true,
      toolCalling: true,
      embeddings: true,
      model: 'gpt-4o',
      probed: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a typed error instead of an empty string when unconfigured', async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProvider();

    const error = await provider.generate('hi').catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('unconfigured');
    expect(error.retryable).toBe(false);
    // The request was never attempted, so no credential is even sent.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a 401 as an auth error without retrying', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid API key"}}',
      headers: new Headers(),
    } as unknown as Response);

    const error = await new OpenAIProvider().generate('hi').catch((e) => e);
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 and keeps the attempt count on the error', async () => {
    process.env.AI_MAX_RETRIES = '2';
    process.env.AI_RETRY_BASE_DELAY_MS = '0';
    process.env.AI_RETRY_MAX_DELAY_MS = '0';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response);

    const error = await new OpenAIProvider().generate('hi').catch((e) => e);
    expect(error.kind).toBe('http');
    expect(error.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error.attempts).toBe(3);
  });

  it('parses usage and reports it to the injected listener', async () => {
    fetchMock.mockResolvedValue(
      okChat('hello', { usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } })
    );
    const provider = new OpenAIProvider();
    const reports: Array<{ operation: string; usage: unknown }> = [];
    provider.usageListener = (report) => reports.push(report);

    await expect(provider.generate('hi')).resolves.toBe('hello');
    expect(reports).toHaveLength(1);
    expect(reports[0].operation).toBe('generate');
    expect(reports[0].usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    });
  });

  it('throws a typed parse error instead of { confidence: 0 }', async () => {
    fetchMock.mockResolvedValue(okChat('I could not produce JSON this time'));
    const provider = new OpenAIProvider();

    const error = await provider.generateStructured('give me json').catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('parse');
  });

  it('attaches an AbortSignal so a hung endpoint cannot stall the turn', async () => {
    fetchMock.mockResolvedValue(okChat('ok'));
    await new OpenAIProvider().generate('hi', { timeoutMs: 1234 });
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('OpenAIProvider chat and embeddings', () => {
  const original = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_MAX_RETRIES = '0';
    delete process.env.AI_CAP_OPENAI_TOOL_CALLING;
    delete process.env.AI_CAP_OPENAI_STRUCTURED_OUTPUT;
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...original };
  });

  it('sends tools and parses the resulting tool calls', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o',
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_9', function: { name: 'create_event', arguments: '{"title":"Sync"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      headers: new Headers(),
    } as unknown as Response);

    const result = await new OpenAIProvider().chat({
      messages: [{ role: 'user', content: 'book a sync' }],
      tools: [{ name: 'create_event', description: 'Create an event', parameters: {} }],
    });

    expect(result.toolCalls).toEqual([
      { id: 'call_9', name: 'create_event', arguments: { title: 'Sync' } },
    ]);
    expect(result.finishReason).toBe('tool_calls');
    expect(result.provider).toBe('OpenAI');

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.tools[0].function.name).toBe('create_event');
  });

  it('does not advertise tools to a provider whose capabilities deny them', async () => {
    process.env.AI_CAP_OPENAI_TOOL_CALLING = 'false';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'plain answer' } }] }),
      headers: new Headers(),
    } as unknown as Response);

    await new OpenAIProvider().chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'create_event', description: 'd', parameters: {} }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.tools).toBeUndefined();
  });

  it('threads tool results back as role:tool wire messages', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'done' } }] }),
      headers: new Headers(),
    } as unknown as Response);

    await new OpenAIProvider().chat({
      messages: [
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'x', arguments: {} }] },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'c1', name: 'x' },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.messages[0].tool_calls[0].function.name).toBe('x');
    expect(body.messages[1]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
  });

  it('reports a 200 with no content as an empty error rather than resolving to ""', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
      headers: new Headers(),
    } as unknown as Response);

    const error = await new OpenAIProvider()
      .chat({ messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('empty');
  });

  it('throws instead of returning [] when the embeddings endpoint is down', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response);

    const error = await new OpenAIProvider().embed('query').catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('http');
    expect(Array.isArray(error)).toBe(false);
  });

  it('returns the vector when embeddings succeed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.25, 0.5] }] }),
      headers: new Headers(),
    } as unknown as Response);

    await expect(new OpenAIProvider().embed('query')).resolves.toEqual([0.25, 0.5]);
  });

  it('reports a 200 that carried no vector as an empty error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      headers: new Headers(),
    } as unknown as Response);

    const error = await new OpenAIProvider().embed('query').catch((e) => e);
    expect(error.kind).toBe('empty');
  });
});

describe('NemotronNimProvider Stage 5a behaviour', () => {
  const original = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.NVIDIA_NIM_API_KEY = 'test-key';
    process.env.NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
    process.env.AI_MAX_RETRIES = '0';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...original };
  });

  it('always sends max_tokens and its colder default temperature', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: 'm', choices: [{ message: { content: 'ok' } }] }),
      headers: new Headers(),
    } as unknown as Response);

    await new NemotronNimProvider().generate('hi');
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.3);
  });

  it('declares no native tool calling by default', () => {
    expect(new NemotronNimProvider().getCapabilities()).toMatchObject({
      provider: 'nemotron',
      toolCalling: false,
      structuredOutput: false,
      embeddings: true,
    });
  });

  it('surfaces a transport failure as a typed error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const error = await new NemotronNimProvider().generate('hi').catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('network');
  });

  it('throws rather than returning a confidence-0 object on malformed JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'prose, not json' } }] }),
      headers: new Headers(),
    } as unknown as Response);

    const error = await new NemotronNimProvider().generateStructured('json please').catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('parse');
  });

  it('omits the Authorization header when no key is set and reports unconfigured', async () => {
    delete process.env.NVIDIA_NIM_API_KEY;
    const provider = new NemotronNimProvider();
    const error = await provider.generate('hi').catch((e) => e);
    expect(error.kind).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

