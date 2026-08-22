import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { SessionAuthStateService } from '../services/session-auth-state.service';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  private readonly sessionAuthState: SessionAuthStateService;

  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform
  ) {
    this.sessionAuthState = new SessionAuthStateService(this.nativeStorage);
  }

  canActivate(): Promise<boolean> {
    return this.platform.ready().then(async () => {
      if (!this.platform.is('cordova')) {
        // Running in a browser
        const token = this.sessionAuthState.getLocalToken();
        const user = this.sessionAuthState.getLocalUserRaw();
        if (token && user) {
          if (this.sessionAuthState.isTokenExpired(token)) {
            console.warn('GuestGuard: Found expired/invalid token in browser storage. Clearing auth data.');
            await this.sessionAuthState.clearStoredAuth(false);
            return true;
          }
          console.log('Auth token and user found, redirecting to /tabs/new-friends');
          this.router.navigate(['/tabs/new-friends']);
          return false; // Prevent access to guest routes
        } else {
          console.log('Auth token or user not found, allowing access to guest routes');
          return true; // Allow access to guest routes
        }
      }

      // Running on a Cordova platform
      return Promise.all([
        this.sessionAuthState.getNativeToken().catch(() => null),
        this.sessionAuthState.getNativeUser()
      ]).then(async ([token, user]) => {
        if (token && user) {
          if (this.sessionAuthState.isTokenExpired(token)) {
            console.warn('GuestGuard: Found expired/invalid token in native storage. Clearing auth data.');
            await this.sessionAuthState.clearStoredAuth(true);
            return true;
          }
          console.log('Auth token and user found, redirecting to /tabs/new-friends');
          this.router.navigate(['/tabs/new-friends']);
          return false; // Prevent access to guest routes
        } else {
          console.log('Auth token or user not found, allowing access to guest routes');
          return true; // Allow access to guest routes
        }
      });
    });
  }
}
