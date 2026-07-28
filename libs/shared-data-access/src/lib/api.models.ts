export interface Outage {
  id: string;
  reference: string;
  zoneId: string;
  zoneLabel: string;
  reason: string;
  status: string;
  startsAt: string;
  durationMinutes: number;
  affectedCustomers: number;
  supervisorApprovalRequired?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateOutage {
  zoneId: string;
  zoneLabel: string;
  reason: string;
  startsAt: string;
  durationMinutes: number;
  supervisorApprovalRequired: boolean;
}

export interface Incident {
  id: string;
  reference: string;
  type: string;
  description: string | null;
  address: string;
  severity: string;
  status: string;
  photos: string[];
  communityConfirmations: number;
  contractNumber?: string | null;
  assignedTeamCode?: string | null;
  activity?: Array<{ at: string; label: string; actor: string }>;
  createdAt: string;
  updatedAt?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
}

export interface CreateIncident {
  type: string;
  description?: string;
  address: string;
  latitude: number;
  longitude: number;
  photos?: string[];
  contractNumber?: string;
}

export interface Mission {
  id: string;
  reference: string;
  teamCode: string;
  incidentId: string;
  status: string;
  etaMinutes: number | null;
  diagnosis: string | null;
  lastPositionAt?: string | null;
  lastPosition?: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
  approximatePosition?: {
    latitude: number;
    longitude: number;
  } | null;
  estimatedRepairMinutes?: number | null;
  reportNotes?: string | null;
  photoUrls?: string[];
  requestedResources?: string[];
  statusHistory?: Array<{
    status: string;
    at: string;
    source: string;
  }>;
  emergencyEvents?: Array<{
    type: string;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    createdAt: string;
  }>;
  acceptedAt?: string | null;
  enRouteAt?: string | null;
  onSiteAt?: string | null;
  restoredAt?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceMission extends Mission {
  estimatedRepairMinutes: number | null;
  reportNotes: string | null;
  photoUrls: string[];
  requestedResources: string[];
  statusHistory: Array<{
    status: string;
    at: string;
    source: string;
  }>;
  emergencyEvents: Array<{
    type: string;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    createdAt: string;
  }>;
  distanceKm: number | null;
  elapsedMinutes: number;
  incident: {
    id: string;
    reference: string;
    type: string;
    description: string | null;
    address: string;
    severity: string;
    status: string;
    photos: string[];
    communityConfirmations: number;
    location: {
      type: 'Point';
      coordinates: [number, number];
    } | null;
    activity: Array<{ at: string; label: string; actor: string }>;
    createdAt: string;
  };
  contact: {
    name: string;
    initials: string;
    phone: string | null;
    contractNumber: string | null;
    contractMasked: string;
    address: string;
  };
}

export interface MaintenanceHistoryItem {
  id: string;
  reference: string;
  incidentReference: string;
  incidentType: string;
  address: string;
  severity: string;
  status: string;
  diagnosis: string | null;
  photoCount: number;
  createdAt: string;
  completedAt: string;
  durationMinutes: number;
}

export interface MaintenanceDashboard {
  generatedAt: string;
  team: {
    id: string | null;
    code: string;
    name: string;
    leadName: string;
    phone: string | null;
    vehicle: string;
    status: 'available' | 'on_mission' | 'returning' | 'offline';
    members: number;
    base: string;
    skills: string[];
    lastSeenAt: string | null;
  };
  activeMission: MaintenanceMission | null;
  history: MaintenanceHistoryItem[];
  notifications: Array<{
    id: string;
    type: 'mission' | 'report' | 'availability';
    title: string;
    body: string;
    createdAt: string;
    unread: boolean;
  }>;
}

export interface UpdateMaintenanceReport {
  diagnosis?: string;
  estimatedRepairMinutes?: number;
  notes?: string;
  requestedResources?: string[];
}

export interface AdminDashboard {
  generatedAt: string;
  networkAvailability: number;
  monthlyTarget: number;
  outages: {
    total: number;
    active: number;
    scheduled: number;
    pendingApproval: number;
    affectedCustomers: number;
  };
  incidents: {
    total: number;
    open: number;
    critical: number;
  };
  teams: {
    total: number;
    available: number;
    onMission: number;
    connected: number;
  };
  missions: { active: number };
  notifications: {
    campaigns: number;
    recipients: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
  };
}

export interface FieldTeam {
  id: string;
  code: string;
  name: string;
  leadName: string;
  phone: string;
  vehicle: string;
  status: 'available' | 'on_mission' | 'returning' | 'offline';
  members: number;
  base: string;
  skills: string[];
  currentMissionId: string | null;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
  lastSeenAt: string | null;
  updatedAt: string;
  currentMission?: Mission | null;
}

export interface NotificationCampaign {
  id: string;
  reference: string;
  eventId: string;
  title: string;
  body: string;
  audienceLabel: string;
  zoneId: string | null;
  channels: Array<'push' | 'sms' | 'email'>;
  status: 'queued' | 'sending' | 'delivered' | 'partial' | 'failed';
  recipients: number;
  delivered: number;
  failed: number;
  createdBy: string;
  sentAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  category: string;
  title: string;
  details: string | null;
  severity: 'info' | 'success' | 'warning' | 'critical';
  entityType: string | null;
  entityId: string | null;
  actorEmail: string;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  group: string;
  label: string;
  description: string | null;
  value: boolean | number | string | string[];
  updatedBy: string;
  updatedAt: string;
}

export interface SendNotification {
  title: string;
  body: string;
  audienceLabel: string;
  zoneId?: string;
  channels: Array<'push' | 'sms' | 'email'>;
  recipients: number;
}

export interface CitizenPublicOutage extends Outage {
  longitude: number;
  latitude: number;
}

export interface CitizenMission {
  id: string;
  reference: string;
  teamCode: string;
  status: string;
  etaMinutes: number | null;
  diagnosis: string | null;
  lastPositionAt: string | null;
  approximatePosition: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface CitizenTimelineStep {
  key: string;
  label: string;
  state: 'completed' | 'current' | 'upcoming';
  at: string | null;
}

export interface CitizenReportSummary {
  id: string;
  reference: string;
  type: string;
  address: string;
  severity: string;
  status: string;
  assignedTeamCode: string | null;
  communityConfirmations: number;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenNotification {
  id: string;
  type: 'mission' | 'outage' | 'report';
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
}

export interface CitizenDashboard {
  generatedAt: string;
  profile: {
    firstName: string;
    contractNumber: string | null;
    address: string;
    district: string;
    governorate: string;
    latitude: number;
    longitude: number;
  };
  situation: {
    state:
      | 'intervention_in_progress'
      | 'outage_confirmed'
      | 'scheduled'
      | 'normal';
    zoneId: string;
    zoneLabel: string;
    cause: string;
    affectedCustomers: number;
    communityConfirmations: number;
    estimatedRestorationAt: string;
    lastUpdatedAt: string;
    powerRestoredConfirmedAt: string | null;
  };
  currentOutage: CitizenPublicOutage | null;
  mission: CitizenMission | null;
  timeline: CitizenTimelineStep[];
  upcomingOutages: CitizenPublicOutage[];
  myReports: CitizenReportSummary[];
  notifications: CitizenNotification[];
}

export interface CitizenMapIncident {
  id: string;
  reference: string;
  type: string;
  severity: string;
  status: string;
  zoneLabel: string;
  communityConfirmations: number;
  longitude: number;
  latitude: number;
  updatedAt: string;
}

export interface CitizenMapData {
  generatedAt: string;
  center: {
    longitude: number;
    latitude: number;
  };
  outages: CitizenPublicOutage[];
  incidents: CitizenMapIncident[];
}

export interface CitizenSafetyGuide {
  id: string;
  icon: string;
  title: string;
  summary: string;
  steps: string[];
  tone: 'danger' | 'warning' | 'info' | 'violet';
}

export interface CitizenSafety {
  generatedAt: string;
  emergency: {
    label: string;
    phone: string;
    displayPhone: string;
    description: string;
  };
  service: {
    label: string;
    phone: string;
    displayPhone: string;
    description: string;
  };
  guides: CitizenSafetyGuide[];
  faqs: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
  officialSource: string;
}

export interface CitizenConfirmationPayload {
  kind: 'outage_confirmed' | 'power_restored';
  zoneId: string;
  outageId?: string;
  incidentId?: string;
  note?: string;
}

export interface CitizenConfirmationResponse {
  id: string;
  kind: CitizenConfirmationPayload['kind'];
  zoneId: string;
  createdAt: string;
  message: string;
}
