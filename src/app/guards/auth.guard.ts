import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform
  ) {}

  async canActivate(): Promise<boolean> {
    await this.platform.ready();
    
    let token: string;
    let user: any;

    if (this.platform.is('cordova')) {
      try {
        token = await this.nativeStorage.getItem('token');
        // Prefer canonical key 'currentUser', fallback to legacy 'user'
        try {
          user = await this.nativeStorage.getItem('currentUser');
        } catch (e) {
          try { user = await this.nativeStorage.getItem('user'); } catch (e2) { user = null; }
        }
        console.log('Auth token found in NativeStorage:', token);
      } catch (err) {
        console.log('Auth token not found in NativeStorage', err);
      }
    } else {
      token = localStorage.getItem('token');
  const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  user = raw ? JSON.parse(raw) : null;
      if (token) {
        console.log('Auth token found in localStorage:', token);
      } else {
        console.log('Auth token not found in localStorage');
      }
    }

    if (token && user) {
      return true;
    } else {
      if (token && !user) {
        console.warn('AuthGuard: Token found but user missing. Clearing inconsistent storage to prevent loop.');
        try { localStorage.removeItem('token'); } catch (e) {}
        if (this.platform.is('cordova')) {
          try { this.nativeStorage.remove('token').catch(() => {}); } catch (e) {}
        }
      }
      console.log('Auth token not found, redirecting to /auth/signin');
      this.router.navigate(['/auth/signin']);
      return false;
    }
  }
}
