import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const isPublicAuthRequest = /\/auth\/(login|register|refresh)$/.test(request.url);
  const token = auth.accessToken();
  const authenticatedRequest =
    token && !isPublicAuthRequest
      ? request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        })
      : request.clone({ withCredentials: true });

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isPublicAuthRequest) return throwError(() => error);
      return auth.refresh().pipe(
        switchMap(() =>
          next(
            request.clone({
              setHeaders: {
                Authorization: `Bearer ${auth.accessToken() ?? ''}`,
              },
              withCredentials: true,
            }),
          ),
        ),
        catchError((refreshError) => throwError(() => refreshError)),
      );
    }),
  );
};
