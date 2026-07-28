import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, of, tap, throwError } from 'rxjs';
import { API_BASE_URL } from './provide-steg-api';
import { AuthResponse, AuthUser, RegisterCitizen } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly tokenKey = 'stegflow_access_token';
  private readonly persistKey = 'stegflow_persist_session';

  readonly user = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(this.readStoredToken());
  readonly initialized = signal(false);
  readonly loading = signal(false);
  readonly isAuthenticated = computed(() => !!this.user() && !!this.accessToken());

  /**
   * « Garder ma session » : le jeton d'accès survit à la fermeture de l'onglet.
   * Le jeton de rafraîchissement reste, lui, dans un cookie HttpOnly.
   */
  readonly persistSession = signal(localStorage.getItem(this.persistKey) === '1');

  initialize(): Observable<AuthUser | null> {
    if (this.initialized()) return of(this.user());
    this.loading.set(true);
    const request: Observable<AuthUser | null> = this.accessToken()
      ? this.me()
      : this.refresh().pipe(map((response) => response.user));
    return request.pipe(
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
      finalize(() => {
        this.initialized.set(true);
        this.loading.set(false);
      }),
    );
  }

  login(email: string, password: string, remember = this.persistSession()) {
    this.setPersistence(remember);
    this.loading.set(true);
    return this.http
      .post<AuthResponse>(
        `${this.apiBaseUrl}/auth/login`,
        { email, password },
        { withCredentials: true },
      )
      .pipe(
        tap((response) => this.setSession(response)),
        finalize(() => this.loading.set(false)),
      );
  }

  register(payload: RegisterCitizen, remember = this.persistSession()) {
    this.setPersistence(remember);
    this.loading.set(true);
    return this.http
      .post<AuthResponse>(`${this.apiBaseUrl}/auth/register`, payload, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => this.setSession(response)),
        finalize(() => this.loading.set(false)),
      );
  }

  refresh() {
    return this.http
      .post<AuthResponse>(
        `${this.apiBaseUrl}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(tap((response) => this.setSession(response)));
  }

  me() {
    return this.http
      .get<AuthUser>(`${this.apiBaseUrl}/auth/me`)
      .pipe(tap((user) => this.user.set(user)));
  }

  logout() {
    const request: Observable<unknown> = this.accessToken()
      ? this.http.post(`${this.apiBaseUrl}/auth/logout`, {}, { withCredentials: true })
      : of(null);
    return request.pipe(
      catchError(() => of(null)),
      finalize(() => this.clearSession()),
    );
  }

  requireRole(allowedRoles: AuthUser['role'][]) {
    const user = this.user();
    if (!user || !allowedRoles.includes(user.role)) {
      this.clearSession();
      return throwError(() => new Error('Ce compte ne peut pas accéder à cet espace.'));
    }
    return of(user);
  }

  setPersistence(persist: boolean) {
    this.persistSession.set(persist);
    localStorage.setItem(this.persistKey, persist ? '1' : '0');
    const token = this.accessToken();
    if (token) this.storeToken(token);
  }

  private setSession(response: AuthResponse) {
    this.storeToken(response.accessToken);
    this.accessToken.set(response.accessToken);
    this.user.set(response.user);
    this.initialized.set(true);
  }

  private clearSession() {
    sessionStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.tokenKey);
    this.accessToken.set(null);
    this.user.set(null);
  }

  private storeToken(token: string) {
    const [target, other] = this.persistSession()
      ? [localStorage, sessionStorage]
      : [sessionStorage, localStorage];
    target.setItem(this.tokenKey, token);
    other.removeItem(this.tokenKey);
  }

  private readStoredToken(): string | null {
    return sessionStorage.getItem(this.tokenKey) ?? localStorage.getItem(this.tokenKey);
  }
}
