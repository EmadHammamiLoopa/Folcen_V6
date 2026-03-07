import { devLogger } from "src/app/utils/dev-logger";
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { switchMap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private nativeStorage: NativeStorage,
    private platform: Platform,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return from(this.platform.ready()).pipe(
      switchMap(() => {
        if (this.platform.is('cordova')) {
          return from(this.nativeStorage.getItem('token').catch(err => {
            devLogger.log('Auth token not found in NativeStorage', err);
            return null;
          }));
        } else {
          return from(Promise.resolve(localStorage.getItem('token')));
        }
      }),
      switchMap(token => {
        if (token) {
      //    console.log('Token:', token); // Log the token
          const cloned = req.clone({
            headers: req.headers.set('Authorization', `Bearer ${token}`)
          });
          return next.handle(cloned).pipe(
            catchError((error: HttpErrorResponse) => {
              if (error.status === 403 && error.error?.errorCode === 'EMAIL_NOT_VERIFIED') {
                devLogger.log('Email not verified — redirecting to verify-email step');
                this.router.navigate(['/auth/signup']);
              }
              return throwError(error);
            })
          );
        } else {
          return next.handle(req);
        }
      })
    );
  }
}
