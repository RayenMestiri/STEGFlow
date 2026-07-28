import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from './provide-steg-api';
import {
  CreateIncident,
  CreateOutage,
  AdminDashboard,
  AuditEntry,
  CitizenConfirmationPayload,
  CitizenConfirmationResponse,
  CitizenDashboard,
  CitizenMapData,
  CitizenSafety,
  FieldTeam,
  Incident,
  MaintenanceDashboard,
  MaintenanceHistoryItem,
  Mission,
  NotificationCampaign,
  Outage,
  SendNotification,
  SystemSetting,
  UpdateMaintenanceReport,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class StegApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getOutages() {
    return this.http.get<Outage[]>(`${this.baseUrl}/outages`);
  }

  createOutage(payload: CreateOutage) {
    return this.http.post<Outage>(`${this.baseUrl}/outages`, payload);
  }

  publishOutage(id: string) {
    return this.http.post<Outage>(`${this.baseUrl}/outages/${id}/publish`, {});
  }

  getIncidents() {
    return this.http.get<Incident[]>(`${this.baseUrl}/incidents`);
  }

  createIncident(payload: CreateIncident) {
    return this.http.post<Incident>(`${this.baseUrl}/incidents`, payload);
  }

  uploadPhoto(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ bucket: string; key: string; url: string; provider?: string }>(
      `${this.baseUrl}/media/photos`,
      form,
    );
  }

  getMission(id: string) {
    return this.http.get<Mission>(`${this.baseUrl}/missions/${id}`);
  }

  getCurrentMission() {
    return this.http.get<Mission>(`${this.baseUrl}/missions/current/me`);
  }

  getMaintenanceDashboard() {
    return this.http.get<MaintenanceDashboard>(
      `${this.baseUrl}/missions/me/dashboard`,
    );
  }

  getMaintenanceHistory() {
    return this.http.get<MaintenanceHistoryItem[]>(
      `${this.baseUrl}/missions/me/history`,
    );
  }

  getCitizenTracking() {
    return this.http.get<Mission>(`${this.baseUrl}/missions/tracking/current`);
  }

  getOperationsTracking() {
    return this.http.get<Mission[]>(`${this.baseUrl}/missions/tracking/operations`);
  }

  updateMissionStatus(id: string, status: string, diagnosis?: string) {
    return this.http.patch<Mission>(`${this.baseUrl}/missions/${id}/status`, {
      status,
      diagnosis,
    });
  }

  updateMissionPosition(id: string, latitude: number, longitude: number) {
    return this.http.post<Mission>(`${this.baseUrl}/missions/${id}/position`, {
      latitude,
      longitude,
    });
  }

  updateMissionReport(id: string, payload: UpdateMaintenanceReport) {
    return this.http.patch<Mission>(
      `${this.baseUrl}/missions/${id}/report`,
      payload,
    );
  }

  addMissionPhotos(id: string, urls: string[]) {
    return this.http.post<Mission>(`${this.baseUrl}/missions/${id}/photos`, {
      urls,
    });
  }

  createMissionEmergency(
    id: string,
    payload: {
      type: 'accident' | 'electrical' | 'security';
      note?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    return this.http.post<{
      missionId: string;
      reference: string;
      event: {
        type: string;
        note: string | null;
        latitude: number | null;
        longitude: number | null;
        createdAt: string;
      };
      message: string;
    }>(`${this.baseUrl}/missions/${id}/emergency`, payload);
  }

  getAdminDashboard() {
    return this.http.get<AdminDashboard>(`${this.baseUrl}/admin/dashboard`);
  }

  updateOutageStatus(id: string, status: string) {
    return this.http.patch<Outage>(`${this.baseUrl}/admin/outages/${id}/status`, { status });
  }

  updateIncident(id: string, update: { status?: string; severity?: string }) {
    return this.http.patch<Incident>(`${this.baseUrl}/admin/incidents/${id}`, update);
  }

  assignIncident(id: string, teamId: string) {
    return this.http.post<{ incident: Incident; team: FieldTeam; mission: Mission }>(
      `${this.baseUrl}/admin/incidents/${id}/assign`,
      { teamId },
    );
  }

  getTeams() {
    return this.http.get<FieldTeam[]>(`${this.baseUrl}/admin/teams`);
  }

  updateTeamStatus(id: string, status: FieldTeam['status']) {
    return this.http.patch<FieldTeam>(`${this.baseUrl}/admin/teams/${id}`, { status });
  }

  getNotificationCampaigns() {
    return this.http.get<NotificationCampaign[]>(`${this.baseUrl}/admin/notifications`);
  }

  sendNotification(payload: SendNotification) {
    return this.http.post<NotificationCampaign>(`${this.baseUrl}/admin/notifications`, payload);
  }

  retryNotification(id: string) {
    return this.http.post<NotificationCampaign>(
      `${this.baseUrl}/admin/notifications/${id}/retry`,
      {},
    );
  }

  getAuditLog() {
    return this.http.get<AuditEntry[]>(`${this.baseUrl}/admin/audit`);
  }

  getSystemSettings() {
    return this.http.get<SystemSetting[]>(`${this.baseUrl}/admin/settings`);
  }

  updateSystemSettings(
    settings: Array<{
      key: string;
      booleanValue?: boolean;
      stringValue?: string;
      numberValue?: number;
    }>,
  ) {
    return this.http.patch<SystemSetting[]>(`${this.baseUrl}/admin/settings`, { settings });
  }

  getCitizenDashboard() {
    return this.http.get<CitizenDashboard>(`${this.baseUrl}/citizen/dashboard`);
  }

  getCitizenMap() {
    return this.http.get<CitizenMapData>(`${this.baseUrl}/citizen/map`);
  }

  getCitizenSafety() {
    return this.http.get<CitizenSafety>(`${this.baseUrl}/citizen/safety`);
  }

  confirmCitizenSituation(payload: CitizenConfirmationPayload) {
    return this.http.post<CitizenConfirmationResponse>(
      `${this.baseUrl}/citizen/confirmations`,
      payload,
    );
  }
}
