import {
  CapabilityCache,
  defaultCapabilities,
  mergeProbeResult,
  normalizeProviderKey,
} from './ai-capabilities';

/**
 * Capability is data, not code: the Stage 5b loop reads it to decide whether to
 * use native tool calls or degrade to prompt-constrained JSON. A wrong `true` is
 * worse than a conservative `false`, because a provider that ignores `tools`
 * still returns 200 — it just returns prose instead of a call.
 */
describe('ai-capabilities defaults', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('assumes only chat for Ollama and Nemotron', () => {
    delete process.env.AI_CAP_OLLAMA_TOOL_CALLING;
    delete process.env.AI_CAP_NEMOTRON_TOOL_CALLING;
    expect(defaultCapabilities('ollama').toolCalling).toBe(false);
    expect(defaultCapabilities('nemotron').structuredOutput).toBe(false);
    expect(defaultCapabilities('ollama').chat).toBe(true);
    expect(defaultCapabilities('nemotron').embeddings).toBe(true);
  });

  it('grants OpenAI the full set', () => {
    const caps = defaultCapabilities('openai');
    expect(caps).toMatchObject({
      chat: true,
      toolCalling: true,
      structuredOutput: true,
      embeddings: true,
      probed: false,
    });
  });

  it('normalises the display names the providers actually use', () => {
    expect(normalizeProviderKey('OpenAI')).toBe('openai');
    expect(normalizeProviderKey('Nemotron-NIM')).toBe('nemotron');
    expect(normalizeProviderKey('Ollama')).toBe('ollama');
    expect(normalizeProviderKey('totally-unknown')).toBeUndefined();
  });

  it('lets the model name be overridden without losing the capability flags', () => {
    expect(defaultCapabilities('ollama', 'gpt-oss:20b')).toMatchObject({
      model: 'gpt-oss:20b',
      chat: true,
    });
  });

  it('falls back to the least-capable assumption for an unknown provider', () => {
    const caps = defaultCapabilities('something-new');
    expect(caps).toMatchObject({
      chat: true,
      toolCalling: false,
      structuredOutput: false,
      embeddings: false,
    });
  });

  it('honours environment overrides in both directions', () => {
    process.env.AI_CAP_OLLAMA_TOOL_CALLING = 'true';
    expect(defaultCapabilities('ollama').toolCalling).toBe(true);

    process.env.AI_CAP_OPENAI_TOOL_CALLING = 'false';
    expect(defaultCapabilities('openai').toolCalling).toBe(false);

    // Anything not matching the truthy pattern is treated as false, not ignored.
    process.env.AI_CAP_OPENAI_EMBEDDINGS = 'maybe';
    expect(defaultCapabilities('openai').embeddings).toBe(false);
  });

  it('treats an empty override as unset so .env placeholders are harmless', () => {
    process.env.AI_CAP_OPENAI_TOOL_CALLING = '';
    expect(defaultCapabilities('openai').toolCalling).toBe(true);
  });
});

describe('ai-capabilities probe merging', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('marks the merged set as probed and adopts the live flags', () => {
    const declared = defaultCapabilities('ollama');
    const merged = mergeProbeResult(declared, { toolCalling: true, model: 'qwen2.5' });
    expect(merged.probed).toBe(true);
    expect(merged.toolCalling).toBe(true);
    expect(merged.model).toBe('qwen2.5');
    // Untouched legs keep the declared value rather than defaulting to false.
    expect(merged.embeddings).toBe(false);
  });

  it('keeps an explicit operator override authoritative over a probe', () => {
    process.env.AI_CAP_OPENAI_TOOL_CALLING = 'false';
    const declared = defaultCapabilities('openai');
    const merged = mergeProbeResult(declared, { toolCalling: true });
    expect(merged.toolCalling).toBe(false);
  });

  it('returns the declared set unchanged when there is nothing to merge', () => {
    const declared = defaultCapabilities('openai');
    expect(mergeProbeResult(declared, undefined)).toBe(declared);
  });

  it('caches per provider name case-insensitively', () => {
    const cache = new CapabilityCache();
    cache.set('OpenAI', mergeProbeResult(defaultCapabilities('openai'), { toolCalling: true }));
    expect(cache.get('openai')?.probed).toBe(true);
    cache.clear();
    expect(cache.get('openai')).toBeUndefined();
  });
});
