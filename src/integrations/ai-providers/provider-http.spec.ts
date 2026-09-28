import { AiProviderError } from './ai-provider.error';
import {
  classifyStatus,
  computeBackoffMs,
  extractJson,
  parseRetryAfter,
  parseToolCalls,
  parseUsage,
  postJson,
  retryBudget,
  withRetry,
} from './provider-http';

/**
 * Stage 5a transport policy. These are the rules every provider now depends on,
 * so they are tested once here rather than three times per provider.
 */
describe('provider-http status classification', () => {
  it.each([408, 425, 429, 500, 502, 503, 504, 509])('treats %i as retryable', (status) => {
    const { retryable } = classifyStatus(status);
    expect(retryable).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('never retries %i', (status) => {
    expect(classifyStatus(status).retryable).toBe(false);
  });

  it('labels 401/403 as auth so a bad key is not mistaken for an outage', () => {
    expect(classifyStatus(401).kind).toBe('auth');
    expect(classifyStatus(403).kind).toBe('auth');
  });

  it('labels 429 as rate_limit and 500 as http', () => {
    expect(classifyStatus(429).kind).toBe('rate_limit');
    expect(classifyStatus(500).kind).toBe('http');
  });
});

describe('provider-http retry budget and backoff', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('honours an explicit 0 budget instead of falling back to the default', () => {
    process.env.AI_MAX_RETRIES = '2';
    expect(retryBudget(0)).toBe(0);
    expect(retryBudget(undefined)).toBe(2);
  });

  it('ignores malformed env values', () => {
    process.env.AI_MAX_RETRIES = 'abc';
    expect(retryBudget()).toBe(2);
  });

  it('respects a numeric Retry-After and caps it', () => {
    process.env.AI_RETRY_MAX_DELAY_MS = '1000';
    expect(computeBackoffMs(1, 30)).toBe(1000);
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter('never')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('jitters below the cap when no Retry-After is present', () => {
    process.env.AI_RETRY_BASE_DELAY_MS = '100';
    process.env.AI_RETRY_MAX_DELAY_MS = '1000';
    const samples = Array.from({ length: 40 }, () => computeBackoffMs(2));
    expect(samples.every((s) => s >= 0 && s <= 1000)).toBe(true);
    // Full jitter over 40 draws should not be a constant; if it were, retries
    // would fire in lockstep and re-create the outage they are recovering from.
    expect(new Set(samples).size).toBeGreaterThan(1);
  });
});

describe('provider-http withRetry', () => {
  it('retries transient failures then succeeds', async () => {
    process.env.AI_RETRY_BASE_DELAY_MS = '0';
    process.env.AI_RETRY_MAX_DELAY_MS = '0';
    let calls = 0;
    const value = await withRetry('Test', 'op', async () => {
      calls += 1;
      if (calls < 3) {
        throw new AiProviderError('boom', { provider: 'Test', kind: 'timeout', retryable: true });
      }
      return 'ok';
    }, 2);
    expect(value).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a hard failure', async () => {
    let calls = 0;
    await expect(
      withRetry('Test', 'op', async () => {
        calls += 1;
        throw new AiProviderError('denied', { provider: 'Test', kind: 'auth', retryable: false });
      }, 2)
    ).rejects.toThrow('denied');
    expect(calls).toBe(1);
  });

  it('stamps the final attempt count onto the surfaced error', async () => {
    process.env.AI_RETRY_BASE_DELAY_MS = '0';
    await expect(
      withRetry('Test', 'op', async () => {
        throw new AiProviderError('down', { provider: 'Test', kind: 'network', retryable: true });
      }, 1)
    ).rejects.toMatchObject({ attempts: 2, kind: 'network' });
  });
});

describe('provider-http postJson', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('sends bearer auth, a timeout signal, and parses the JSON body', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
      headers: new Headers(),
    } as unknown as Response);

    const result = await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      apiKey: 'secret-token',
      body: { model: 'm' },
    });

    expect(result.data).toEqual({ hello: 'world' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-token');
    expect(init.signal).toBeDefined();
  });

  it('omits the Authorization header when no key is configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: new Headers(),
    } as unknown as Response);

    await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });

  it('uses the httpError hook so a provider can keep its wording', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response);

    const error = await postJson({
      provider: 'Ollama',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
      httpError: (status) => `Ollama API request failed with HTTP ${status}`,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.message).toBe('Ollama API request failed with HTTP 401');
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(401);
  });

  it('reads Retry-After on a 429', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"slow down"}}',
      headers: new Headers({ 'retry-after': '12' }),
    } as unknown as Response);

    const error = await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
    }).catch((e) => e);

    expect(error.kind).toBe('rate_limit');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterSeconds).toBe(12);
  });
  it('classifies a fetch rejection as a retryable network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const error = await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('reports a timeout when the abort signal fires', async () => {
    const timeout = Object.assign(new Error('The operation aborted'), { name: 'TimeoutError' });
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);

    const error = await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
    }).catch((e) => e);

    expect(error.kind).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  it('throws a parse error when a 2xx body is not JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      headers: new Headers(),
    } as unknown as Response);

    const error = await postJson({
      provider: 'Test',
      operation: 'chat completion',
      url: 'https://example.test/v1/chat/completions',
      body: {},
    }).catch((e) => e);

    expect(error.kind).toBe('parse');
    expect(error.retryable).toBe(false);
  });
});

describe('provider-http payload parsing', () => {
  it('extracts tokens from the OpenAI and Ollama usage spellings', () => {
    expect(
      parseUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
    ).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(
      parseUsage({ usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } })
    ).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: 7 });
    expect(parseUsage({ usage: { prompt_tokens: 2 } })).toEqual({
      promptTokens: 2,
      completionTokens: 0,
      totalTokens: 2,
    });
    expect(parseUsage({})).toBeUndefined();
  });

  it('parses tool calls, including stringified and truncated arguments', () => {
    expect(
      parseToolCalls({
        tool_calls: [
          { id: 'call_1', function: { name: 'create_event', arguments: '{"title":"Standup"}' } },
        ],
      })
    ).toEqual([{ id: 'call_1', name: 'create_event', arguments: { title: 'Standup' } }]);

    // A completion cut off mid-argument must not abort the whole agent step.
    expect(
      parseToolCalls({ tool_calls: [{ id: 'c2', function: { name: 'x', arguments: '{"a":' } }] })
    ).toEqual([{ id: 'c2', name: 'x', arguments: {} }]);

    expect(parseToolCalls({ content: 'no tools here' })).toEqual([]);
  });

  it('unwraps fenced JSON and throws typed errors when there is none', () => {
    expect(extractJson('```json\n{"ok":true}\n```', 'Test')).toEqual({ ok: true });
    expect(extractJson('leading prose [1,2] trailing', 'Test')).toEqual([1, 2]);

    expect(() => extractJson('   ', 'Test')).toThrow(AiProviderError);
    try {
      extractJson('   ', 'Test');
    } catch (error) {
      expect((error as AiProviderError).kind).toBe('empty');
    }

    try {
      extractJson('not json at all', 'Test');
    } catch (error) {
      expect((error as AiProviderError).kind).toBe('parse');
    }

    // Provider wording must survive; this phrase is asserted in ollama.provider.spec.
    expect(() =>
      extractJson('not json', 'Ollama', { parse: 'Ollama returned no JSON value' })
    ).toThrow('Ollama returned no JSON value');
  });
});



