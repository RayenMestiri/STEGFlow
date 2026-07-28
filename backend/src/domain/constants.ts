export const USER_ROLES = [
  'admin',
  'supervisor',
  'dispatcher',
  'technician',
  'citizen',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const OUTAGE_STATUSES = [
  'draft',
  'pending_approval',
  'scheduled',
  'notified',
  'active',
  'restored',
  'closed',
] as const;
export type OutageStatus = (typeof OUTAGE_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  'reported',
  'verified',
  'dispatched',
  'in_progress',
  'resolved',
  'rejected',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const MISSION_STATUSES = [
  'assigned',
  'accepted',
  'en_route',
  'on_site',
  'diagnosing',
  'repairing',
  'testing',
  'restored',
  'closed',
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const FIELD_TEAM_STATUSES = [
  'available',
  'on_mission',
  'returning',
  'offline',
] as const;
export type FieldTeamStatus = (typeof FIELD_TEAM_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['push', 'sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = [
  'queued',
  'sending',
  'delivered',
  'partial',
  'failed',
] as const;

export const CONFIRMATION_KINDS = [
  'outage_confirmed',
  'power_restored',
] as const;

export const AUTH_EVENT_TYPES = [
  'login_success',
  'login_failed',
  'account_locked',
  'register',
  'refresh_reuse',
  'logout',
] as const;

export const PUBLIC_OUTAGE_STATUSES: OutageStatus[] = [
  'scheduled',
  'notified',
  'active',
  'restored',
  'closed',
];

export const OUTAGE_ZONES = [
  {
    id: 'zone-el-menzah-6-a3',
    label: 'El Menzah 6',
    longitude: 10.1764,
    latitude: 36.8427,
    affectedCustomers: 1842,
  },
  {
    id: 'zone-le-bardo-b1',
    label: 'Le Bardo',
    longitude: 10.1346,
    latitude: 36.8094,
    affectedCustomers: 2310,
  },
  {
    id: 'zone-la-marsa-hta',
    label: 'La Marsa',
    longitude: 10.3303,
    latitude: 36.8782,
    affectedCustomers: 1450,
  },
  {
    id: 'zone-cite-ennasr-2',
    label: 'Cité Ennasr 2',
    longitude: 10.1635,
    latitude: 36.8667,
    affectedCustomers: 1976,
  },
] as const;

function normalizeZone(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function resolveOutageZone(zoneId: string, zoneLabel: string) {
  const normalizedId = normalizeZone(zoneId);
  const normalizedLabel = normalizeZone(zoneLabel);
  return (
    OUTAGE_ZONES.find(
      (zone) =>
        normalizeZone(zone.id) === normalizedId ||
        normalizeZone(zone.label) === normalizedLabel,
    ) ?? null
  );
}
