import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private router: Router, private toastr: ToastrService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Skip showing a toast on the signin page itself
          if (!this.router.url.startsWith('/auth')) {
            const msg = error?.error?.message || 'Your session has expired. Please sign in again.';
            this.toastr.error(msg, 'Unauthorized', { timeOut: 4000 });
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.router.navigateByUrl('/auth');
          }
        }
        return throwError(error);
      })
    );
  }
}
