import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unexpected error occurred.';

      if (error.status === 0) {
        errorMessage = 'Network error: Unable to connect to the server.';
      } else if (error.status === 400) {
        errorMessage = 'Bad request: Please check your input.';
      } else if (error.status === 401) {
        errorMessage = 'Unauthorized: Please log in again.';
      } else if (error.status === 403) {
        errorMessage = 'Forbidden: You do not have permission.';
      } else if (error.status === 404) {
        errorMessage = 'Not found: The requested resource could not be found.';
      } else if (error.status === 422) {
        errorMessage = 'Validation error: Please check your input.';
      } else if (error.status >= 500) {
        errorMessage = 'Server error: Please try again later.';
      }

      if (!isProductionEnvironment()) {
        console.error('[HTTP Error Interceptor]', {
          status: error.status,
          message: error.message,
          url: error.url,
          details: error.error,
        });
      }

      return throwError(() => ({
        status: error.status,
        message: errorMessage,
        originalError: error,
      }));
    })
  );
};

function isProductionEnvironment(): boolean {
  return typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    !window.location.hostname.includes('127.0.0.1');
}
