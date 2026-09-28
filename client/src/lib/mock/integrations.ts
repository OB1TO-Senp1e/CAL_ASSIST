import { mockId } from '@/lib/mock/calendar';
import type { CalendarDTO, CalendarProvider } from '@/services/types';
import type { CalendarConnectionDTO, DeadlineDTO, MeetingExtractionDTO, MeetingPreparationDTO, NotificationPreferencesDTO, TravelRequestDTO, TravelResultDTO } from '@/services/workflow-types';

const CONNECTIONS_KEY = 'calassist-mock-connections';
const NOTIFICATIONS_KEY = 'calassist-mock-notification-preferences';
const PREPARATIONS_KEY = 'calassist-mock-meeting-preparations';
const EXTRACTIONS_KEY = 'calassist-mock-meeting-extractions';
const DEADLINES_KEY = 'calassist-mock-deadlines';
const VERSION = 1;

function read<T>(key: string, seed: () => T): T { try { const raw = localStorage.getItem(key); if (!raw) return seed(); const stored = JSON.parse(raw) as { version: number; data: T }; return stored.version === VERSION ? stored.data : seed(); } catch { return seed(); } }
function write<T>(key: string, data: T) { try { localStorage.setItem(key, JSON.stringify({ version: VERSION, data })); } catch { /* Storage is optional in the Stage 2 mock. */ } }
function now() { return new Date().toISOString(); }

function calendar(id: string, name: string, provider: CalendarProvider, color: string): CalendarDTO {
  return { id, userId: 'usr_demo', connectionId: null, name, description: `${provider.toLowerCase()} calendar`, color, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', isVisible: true, isPrimary: name === 'Primary', provider, externalId: null };
}
function seedConnections(): CalendarConnectionDTO[] {
  return [
    { id: 'connection_local', userId: 'usr_demo', provider: 'LOCAL', externalUserId: 'usr_demo', scopes: [], isActive: true, lastSync: now(), syncError: null, createdAt: now(), updatedAt: now(), calendars: [calendar('cal_local_primary', 'Primary', 'LOCAL', '#3b82f6')] },
    { id: 'connection_google', userId: 'usr_demo', provider: 'GOOGLE', externalUserId: 'demo@gmail.com', scopes: ['calendar.readonly', 'calendar.events'], isActive: true, lastSync: new Date(Date.now() - 18 * 60_000).toISOString(), syncError: null, createdAt: now(), updatedAt: now(), calendars: [calendar('cal_google_work', 'Work', 'GOOGLE', '#34a853'), calendar('cal_google_personal', 'Personal', 'GOOGLE', '#4285f4')] },
    { id: 'connection_outlook', userId: 'usr_demo', provider: 'OUTLOOK', externalUserId: null, scopes: [], isActive: false, lastSync: null, syncError: null, createdAt: now(), updatedAt: now(), calendars: [] },
  ];
}
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesDTO = {
  email: { enabled: false }, sms: { enabled: false }, push: { enabled: true }, app: { enabled: true },
  workingHours: { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', muteUntil: null,
};

export const integrationMock = {
  id: (prefix: string) => mockId(`${prefix}_`), now,
  connections: () => read(CONNECTIONS_KEY, seedConnections), saveConnections: (items: CalendarConnectionDTO[]) => write(CONNECTIONS_KEY, items),
  notificationPreferences: () => read(NOTIFICATIONS_KEY, () => DEFAULT_NOTIFICATION_PREFERENCES),
  notificationDefaults: () => DEFAULT_NOTIFICATION_PREFERENCES,
  saveNotificationPreferences: (value: NotificationPreferencesDTO) => write(NOTIFICATIONS_KEY, value),
  preparations: () => read<Record<string, MeetingPreparationDTO>>(PREPARATIONS_KEY, () => ({})),
  savePreparations: (value: Record<string, MeetingPreparationDTO>) => write(PREPARATIONS_KEY, value),
  extractions: () => read<Record<string, MeetingExtractionDTO>>(EXTRACTIONS_KEY, () => ({})),
  saveExtractions: (value: Record<string, MeetingExtractionDTO>) => write(EXTRACTIONS_KEY, value),
  deadlines: () => read<DeadlineDTO[]>(DEADLINES_KEY, () => []),
  saveDeadlines: (value: DeadlineDTO[]) => write(DEADLINES_KEY, value),
  calendar,
};

export function estimateTravel(request: TravelRequestDTO): TravelResultDTO {
  const samePlace = request.origin.address?.trim().toLowerCase() === request.destination.address?.trim().toLowerCase();
  const modeFactor = request.mode === 'WALKING' ? 2.1 : request.mode === 'BICYCLING' ? 1.2 : request.mode === 'TRANSIT' ? 0.9 : 1;
  const addressFactor = Math.max(0, (request.origin.address?.length ?? 0) + (request.destination.address?.length ?? 0));
  const durationMinutes = samePlace ? 1 : Math.max(5, Math.round((12 + addressFactor % 17) * modeFactor));
  const distanceKilometers = samePlace ? 0.1 : Math.round((3.5 + addressFactor % 13) * 10) / 10;
  return { durationMinutes, durationInTrafficMinutes: request.mode === 'DRIVING' ? durationMinutes + 5 : undefined, distanceMeters: Math.round(distanceKilometers * 1000), distanceKilometers, startAddress: request.origin.address, endAddress: request.destination.address, provider: 'Mock estimate', trafficModel: request.mode === 'DRIVING' ? 'BEST_GUESS' : undefined, warnings: ['Preview estimate only; no route provider is connected.'] };
}