import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'situation', pathMatch: 'full' },
  {
    path: 'situation',
    loadComponent: () =>
      import('./pages/situation/situation').then((m) => m.SituationPage),
  },
  {
    path: 'map',
    loadComponent: () =>
      import('./pages/map/map').then((m) => m.MapPage),
  },
  {
    path: 'safety',
    loadComponent: () =>
      import('./pages/safety/safety').then((m) => m.SafetyPage),
  },
  { path: '**', redirectTo: 'situation' },
];
