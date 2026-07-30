import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  {
    path: 'overview',
    loadComponent: () =>
      import('./pages/overview/overview').then((m) => m.OverviewPage),
  },
  {
    path: 'outages',
    loadComponent: () =>
      import('./pages/outages/outages').then((m) => m.OutagesPage),
  },
  {
    path: 'incidents',
    loadComponent: () =>
      import('./pages/incidents/incidents').then((m) => m.IncidentsPage),
  },
  {
    path: 'teams',
    loadComponent: () =>
      import('./pages/teams/teams').then((m) => m.TeamsPage),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./pages/notifications/notifications').then((m) => m.NotificationsPage),
  },
  {
    path: 'audit',
    loadComponent: () =>
      import('./pages/audit/audit').then((m) => m.AuditPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'overview' },
];
