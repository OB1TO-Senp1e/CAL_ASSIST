import { AI_CONSENT_GATE, AiProviderService } from './ai-provider.service';
import { AiProviderError } from './ai-provider.error';
import { AIProviderInterface } from './interfaces/ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';

/**
 * C6 acceptance: every AI call that carries Google data is blocked until the
 * user consented; the provider must never be reached. Consent-free calls and
 * the gate's fail-closed behavior (no gate wired / no userId) are covered too.
 */
describe('AiProviderService C6 consent gate', () => {
  const fakeProvider = () =>
    ({
      providerName: 'Fake',
      generate: jest.fn(async () => 'answer'),
      generateStructured: jest.fn(async () => ({ ok: true })),
      chat: jest.fn(async () => ({ content: 'x', toolCalls: [], model: 'm', provider: 'Fake' })),
    }) as unknown as AIProviderInterface;

  const build = (gate?: { hasConsent: jest.Mock }) => {
    const openai = fakeProvider() as any;
    const ollama = fakeProvider() as any;
    const nemotron = fakeProvider() as any;
    const service = new AiProviderService(
      openai as OpenAIProvider,
      ollama as OllamaProvider,
      nemotron as NemotronNimProvider,
      undefined,
      undefined,
      gate ? (gate as any) : undefined
    );
    (service as any).useFallback = false;
    return { service, openai, gate };
  };

  it('blocks a gated generateStructured when consent is missing, without touching the provider', async () => {
    const gate = { hasConsent: jest.fn(async () => false) };
    const { service, openai } = build(gate);

    await expect(
      service.generateStructured('calendar payload', { userId: 'u1', includesGoogleData: true })
    ).rejects.toMatchObject({ name: 'AiProviderError', kind: 'consent_required' });
    expect(openai.generateStructured).not.toHaveBeenCalled();
    expect(gate.hasConsent).toHaveBeenCalledWith('u1');
  });

  it('allows the call when consent was granted', async () => {
    const gate = { hasConsent: jest.fn(async () => true) };
    const { service, openai } = build(gate);

    await expect(
      service.generateStructured('calendar payload', { userId: 'u1', includesGoogleData: true })
    ).resolves.toEqual({ ok: true });
    expect(openai.generateStructured).toHaveBeenCalled();
  });

  it('does not consult consent for calls without Google data', async () => {
    const gate = { hasConsent: jest.fn(async () => false) };
    const { service, openai } = build(gate);

    await expect(service.generate('plain prompt')).resolves.toBe('answer');
    expect(gate.hasConsent).not.toHaveBeenCalled();
  });

  it('fails closed with no gate wired or no userId', async () => {
    const { service: noGate } = build(undefined);
    await expect(
      noGate.generateStructured('payload', { userId: 'u1', includesGoogleData: true })
    ).rejects.toBeInstanceOf(AiProviderError);

    const gate = { hasConsent: jest.fn(async () => true) };
    const { service } = build(gate);
    await expect(service.generate('payload', { includesGoogleData: true })).rejects.toThrow(
      /requires a userId/
    );
    expect(gate.hasConsent).not.toHaveBeenCalled();
  });

  it('gates chat() the same way', async () => {
    const gate = { hasConsent: jest.fn(async () => false) };
    const { service } = build(gate);

    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'calendar stuff' }],
        userId: 'u1',
        includesGoogleData: true,
      })
    ).rejects.toMatchObject({ kind: 'consent_required' });
    expect(gate.hasConsent).toHaveBeenCalledWith('u1');
  });

  it('AI_CONSENT_GATE token is exported for DI', () => {
    expect(AI_CONSENT_GATE).toBe('AI_CONSENT_GATE');
  });
});
