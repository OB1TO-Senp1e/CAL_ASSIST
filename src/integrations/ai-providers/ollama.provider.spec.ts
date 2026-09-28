import { OllamaProvider } from './ollama.provider';

describe('OllamaProvider', () => {
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalApiKey = process.env.OLLAMA_API_KEY;
  const originalModel = process.env.OLLAMA_MODEL;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.example/v1/';
    process.env.OLLAMA_API_KEY = 'test-token';
    process.env.OLLAMA_MODEL = 'test-model';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
  });

  it('calls the OpenAI-compatible chat completions endpoint with bearer auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    } as Response);

    const result = await new OllamaProvider().generate('say hello', { maxTokens: 30 });
    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('https://ollama.example/v1/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'user', content: 'say hello' }],
      max_tokens: 30,
      stream: false,
    });
    expect(result).toBe('hello');
  });

  it('parses JSON wrapped in a markdown code fence', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
      }),
    } as Response);

    await expect(new OllamaProvider().generateStructured('return json')).resolves.toEqual({
      ok: true,
    });
  });

  it('throws on unsuccessful HTTP responses and malformed structured output', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(new OllamaProvider().generate('test')).rejects.toThrow(
      'Ollama API request failed with HTTP 401'
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
    } as Response);
    await expect(new OllamaProvider().generateStructured('return json')).rejects.toThrow(
      'Ollama returned no JSON value'
    );
  });
});
