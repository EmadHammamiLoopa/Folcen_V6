import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform
  ) {}

  private parseJwtPayload(token: string): any | null {
    try {
      const parts = token?.split('.') || [];
      if (parts.length < 2) {
        return null;
      }
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch (e) {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.parseJwtPayload(token);
    if (!payload || !payload.exp) {
      return true;
    }
    return Date.now() >= Number(payload.exp) * 1000;
  }

  private async clearStoredAuth(): Promise<void> {
    try { localStorage.removeItem('token'); } catch (e) {}
    try { localStorage.removeItem('currentUser'); } catch (e) {}
    try { localStorage.removeItem('user'); } catch (e) {}

    if (this.platform.is('cordova')) {
      try { await this.nativeStorage.remove('token'); } catch (e) {}
      try { await this.nativeStorage.remove('currentUser'); } catch (e) {}
      try { await this.nativeStorage.remove('user'); } catch (e) {}
    }
  }

  canActivate(): Promise<boolean> {
    return this.platform.ready().then(async () => {
      if (!this.platform.is('cordova')) {
        // Running in a browser
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('currentUser') || localStorage.getItem('user');
        if (token && user) {
          if (this.isTokenExpired(token)) {
            console.warn('GuestGuard: Found expired/invalid token in browser storage. Clearing auth data.');
            await this.clearStoredAuth();
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
        this.nativeStorage.getItem('token').catch(() => null),
        this.nativeStorage.getItem('currentUser').catch(() => this.nativeStorage.getItem('user').catch(() => null))
      ]).then(async ([token, user]) => {
        if (token && user) {
          if (this.isTokenExpired(token)) {
            console.warn('GuestGuard: Found expired/invalid token in native storage. Clearing auth data.');
            await this.clearStoredAuth();
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
