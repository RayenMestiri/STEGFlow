import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { authInterceptor } from './auth.interceptor';

export const API_BASE_URL = new InjectionToken<string>('STEGFlow API base URL');

export function provideStegApi(apiBaseUrl = 'http://localhost:3000/api/v1') {
  return makeEnvironmentProviders([
    { provide: API_BASE_URL, useValue: apiBaseUrl },
    provideHttpClient(withInterceptors([authInterceptor])),
  ]);
}

export function resolveStegApiUrl() {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    ['4200', '4201', '4202'].includes(window.location.port)
  ) {
    return 'http://localhost:3000/api/v1';
  }
  return '/api/v1';
}
