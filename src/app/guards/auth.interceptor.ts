import { devLogger } from "src/app/utils/dev-logger";
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { Platform, ToastController } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { switchMap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private nativeStorage: NativeStorage,
    private platform: Platform,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  private async showEmailNotVerifiedToast() {
    const toast = await this.toastCtrl.create({
      message: 'Please verify your email address to access the app.',
      duration: 4000,
      color: 'warning',
      position: 'top',
      buttons: [{ text: 'Dismiss', role: 'cancel' }]
    });
    await toast.present();
  }

  private isAuthEntryRequest(url: string): boolean {
    const normalized = (url || '').toLowerCase();
    return (
      normalized.includes('/auth/signin') ||
      normalized.includes('/auth/signup') ||
      normalized.includes('/auth/firebase-login') ||
      normalized.includes('/auth/verify-email') ||
      normalized.includes('/auth/check-verification') ||
      normalized.includes('/auth/resend-verification') ||
      normalized.includes('/auth/reset-password') ||
      normalized.includes('/auth/forgot-password')
    );
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Never attach stale auth tokens to auth entry endpoints; these requests
    // must rely only on the credentials in their payload.
    if (this.isAuthEntryRequest(req.url)) {
      return next.handle(req);
    }

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
                this.showEmailNotVerifiedToast();
                if (this.router.url !== '/auth/signup') {
                  this.router.navigate(['/auth/signup'], { queryParams: { reason: 'email_not_verified' } });
                }
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
