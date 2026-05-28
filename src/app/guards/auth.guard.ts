import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform,
    private http: HttpClient
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

  private async refreshVerificationStatus(token: string, user: any): Promise<any> {
    if (!token || !user || user.emailVerified !== false) {
      return user;
    }

    try {
      const resp: any = await this.http.get(
        `${environment.apiUrl}/auth/user`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).toPromise();
      const freshUser = resp?.data || user;

      if (freshUser) {
        try { localStorage.setItem('currentUser', JSON.stringify(freshUser)); } catch (e) {}
        try { localStorage.setItem('user', JSON.stringify(freshUser)); } catch (e) {}
        if (this.platform.is('cordova')) {
          try { await this.nativeStorage.setItem('currentUser', freshUser); } catch (e) {}
          try { await this.nativeStorage.setItem('user', freshUser); } catch (e) {}
        }
      }

      return freshUser;
    } catch (e) {
      return user;
    }
  }

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
      if (this.isTokenExpired(token)) {
        console.warn('AuthGuard: Token is expired or invalid. Clearing storage and redirecting to signin.');
        await this.clearStoredAuth();
        this.router.navigate(['/auth/signin']);
        return false;
      }

      user = await this.refreshVerificationStatus(token, user);

      // Block unverified users — redirect to the verify-email step in signup
      if (user.emailVerified === false) {
        this.router.navigate(['/auth/signup'], { queryParams: { reason: 'email_not_verified' } });
        return false;
      }
      return true;
    } else {
      if (token && !user) {
        console.warn('AuthGuard: Token found but user missing. Clearing inconsistent storage to prevent loop.');
        await this.clearStoredAuth();
      }
      console.log('Auth token not found, redirecting to /auth/signin');
      this.router.navigate(['/auth/signin']);
      return false;
    }
  }
}
