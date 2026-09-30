import api from './api';

/** C6: AI processing consent (GET/POST/DELETE /api/ai/consent). */
export interface AiConsentStatus {
  granted: boolean;
  grantedAt: string | null;
  policyVersion: string | null;
  currentPolicyVersion: string;
}

export const aiConsentService = {
  async status(): Promise<AiConsentStatus> {
    return (await api.get<AiConsentStatus>('/api/ai/consent')).data;
  },
  async grant(): Promise<AiConsentStatus> {
    return (await api.post<AiConsentStatus>('/api/ai/consent', {})).data;
  },
  async revoke(): Promise<AiConsentStatus> {
    return (await api.delete<AiConsentStatus>('/api/ai/consent')).data;
  },
};
