import { AiProviderCapabilities } from './interfaces/ai-provider.interface';

/**
 * Stage 5a: what each provider can actually do.
 *
 * The Stage 5b agent loop must not *assume* native tool calling or constrained
 * JSON: Ollama Cloud supports `tools` on some models and not others, and
 * `response_format: json_schema` is unsupported on many. So capability is data,
 * not code — the loop reads it and degrades to prompt-constrained JSON plus
 * local tool-name matching when a provider cannot do better.
 */

/** Canonical provider keys used by `AI_PROVIDER` and by this registry. */
export type AiProviderKey = 'openai' | 'nemotron' | 'ollama';

/** Static baseline per provider, overridable per-flag via environment. */
const DEFAULT_CAPABILITIES: Record<AiProviderKey, AiProviderCapabilities> = {
  openai: {
    provider: 'openai',
    chat: true,
    toolCalling: true,
    structuredOutput: true,
    embeddings: true,
    model: 'gpt-4o',
    probed: false,
  },
  nemotron: {
    provider: 'nemotron',
    chat: true,
    // The NVIDIA `/v1` surface exposes chat completions but its tool-call and
    // `response_format` support varies by model card, so the safe assumption is
    // no — prompt-constrained JSON keeps working if that turns out wrong.
    toolCalling: false,
    structuredOutput: false,
    embeddings: true,
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    probed: false,
  },
  ollama: {
    provider: 'ollama',
    chat: true,
    // Local Ollama ≥0.30 supports tools for llama3.1+/qwen2.5, but Ollama Cloud
    // and older builds do not. Left off until a probe confirms it.
    toolCalling: false,
    structuredOutput: false,
    // `/embeddings` is model-dependent (`nomic-embed-text` etc.) and the current
    // OllamaProvider never implemented it, so this stays false.
    embeddings: false,
    model: 'llama3.2:latest',
    probed: false,
  },
};

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/**
 * Operator escape hatch: `AI_CAP_<PROVIDER>_<FLAG>=true|false`.
 *
 * This exists because the *right* answer for e.g. tool calling on a given
 * Ollama Cloud model is unknowable from code, and getting it wrong in either
 * direction is expensive (false → we never use a feature we have; true → every
 * agent step errors). An env flag beats a guess and beats a release.
 */
function applyEnvOverrides(
  key: AiProviderKey,
  base: AiProviderCapabilities
): AiProviderCapabilities {
  const upper = key.toUpperCase();
  return {
    ...base,
    chat: envFlag(`AI_CAP_${upper}_CHAT`, base.chat),
    toolCalling: envFlag(`AI_CAP_${upper}_TOOL_CALLING`, base.toolCalling),
    structuredOutput: envFlag(`AI_CAP_${upper}_STRUCTURED_OUTPUT`, base.structuredOutput),
    embeddings: envFlag(`AI_CAP_${upper}_EMBEDDINGS`, base.embeddings),
  };
}

/** Unknown provider names fall back to the least-capable assumption. */
export function normalizeProviderKey(name: string): AiProviderKey | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (key === 'openai') return 'openai';
  if (key === 'nemotron' || key === 'nemotron-nim' || key === 'nvidia' || key === 'nvidia-nim') {
    return 'nemotron';
  }
  if (key === 'ollama' || key === 'ollama-cloud') return 'ollama';
  return undefined;
}

/** Static defaults + env overrides, for a provider that has not been probed. */
export function defaultCapabilities(name: string, modelOverride?: string): AiProviderCapabilities {
  const key = normalizeProviderKey(name);
  const base = key
    ? DEFAULT_CAPABILITIES[key]
    : // Unrecognised provider: chat is the only thing we can assume, because
      // `/chat/completions` is the one endpoint every target speaks.
      {
        provider: (name ?? 'unknown').toLowerCase(),
        chat: true,
        toolCalling: false,
        structuredOutput: false,
        embeddings: false,
        model: modelOverride ?? 'unknown',
        probed: false,
      };
  const withEnv = key ? applyEnvOverrides(key, base) : base;
  return modelOverride ? { ...withEnv, model: modelOverride } : withEnv;
}

/**
 * Folds a live probe into the declared capability set.
 *
 * Monotonic in one direction only: a probe may *grant* a capability the static
 * default withheld, or *revoke* one the provider claimed. Env overrides are
 * re-applied afterwards so an explicit operator "false" still wins over a happy
 * probe — otherwise a flaky probe could silently re-enable a feature we were
 * told off.
 */
export function mergeProbeResult(
  declared: AiProviderCapabilities,
  probed: Partial<AiProviderCapabilities> | undefined
): AiProviderCapabilities {
  if (!probed) return declared;
  const merged: AiProviderCapabilities = {
    ...declared,
    provider: probed.provider ?? declared.provider,
    model: probed.model ?? declared.model,
    chat: probed.chat ?? declared.chat,
    toolCalling: probed.toolCalling ?? declared.toolCalling,
    structuredOutput: probed.structuredOutput ?? declared.structuredOutput,
    embeddings: probed.embeddings ?? declared.embeddings,
    probed: true,
  };
  const key = normalizeProviderKey(merged.provider);
  return key ? applyEnvOverrides(key, merged) : merged;
}

/** Cache so a probe runs at most once per provider per process. */
export class CapabilityCache {
  private readonly entries = new Map<string, AiProviderCapabilities>();

  get(name: string): AiProviderCapabilities | undefined {
    return this.entries.get((name ?? '').toLowerCase());
  }

  set(name: string, capabilities: AiProviderCapabilities): AiProviderCapabilities {
    this.entries.set((name ?? '').toLowerCase(), capabilities);
    return capabilities;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const defaultCapabilityCache = new CapabilityCache();
