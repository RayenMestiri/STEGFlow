import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'mission', pathMatch: 'full' },
  {
    path: 'mission',
    loadComponent: () =>
      import('./pages/mission/mission').then((m) => m.MissionPage),
  },
  {
    path: 'report',
    loadComponent: () =>
      import('./pages/report/report').then((m) => m.ReportPage),
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./pages/history/history').then((m) => m.HistoryPage),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: 'mission' },
];
