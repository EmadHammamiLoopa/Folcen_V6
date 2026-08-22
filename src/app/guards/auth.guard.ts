import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { SessionAuthStateService } from '../services/session-auth-state.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private readonly sessionAuthState: SessionAuthStateService;

  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform,
    private http: HttpClient
  ) {
    this.sessionAuthState = new SessionAuthStateService(this.nativeStorage);
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
        await this.sessionAuthState.persistCurrentUser(
          freshUser,
          this.platform.is('cordova')
        );
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
        token = await this.sessionAuthState.getNativeToken();
        user = await this.sessionAuthState.getNativeUser();
        console.log('Auth token found in NativeStorage:', token);
      } catch (err) {
        console.log('Auth token not found in NativeStorage', err);
      }
    } else {
      token = this.sessionAuthState.getLocalToken();
      const raw = this.sessionAuthState.getLocalUserRaw();
      user = raw ? JSON.parse(raw) : null;
      if (token) {
        console.log('Auth token found in localStorage:', token);
      } else {
        console.log('Auth token not found in localStorage');
      }
    }

    if (token && user) {
      if (this.sessionAuthState.isTokenExpired(token)) {
        console.warn('AuthGuard: Token is expired or invalid. Clearing storage and redirecting to signin.');
        await this.sessionAuthState.clearStoredAuth(this.platform.is('cordova'));
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
        // On Cordova, NativeStorage writes are async fire-and-forget; the user object
        // may not be persisted yet. Try localStorage as a fallback before clearing.
        const raw = this.sessionAuthState.getLocalUserRaw();
        if (raw) {
          try { user = JSON.parse(raw); } catch (e) { user = null; }
        }
        if (user) {
          // Found user in localStorage — re-run the verified check
          if (this.sessionAuthState.isTokenExpired(token)) {
            await this.sessionAuthState.clearStoredAuth(this.platform.is('cordova'));
            this.router.navigate(['/auth/signin']);
            return false;
          }
          user = await this.refreshVerificationStatus(token, user);
          if (user.emailVerified === false) {
            this.router.navigate(['/auth/signup'], { queryParams: { reason: 'email_not_verified' } });
            return false;
          }
          return true;
        }
        console.warn('AuthGuard: Token found but user missing. Clearing inconsistent storage to prevent loop.');
        await this.sessionAuthState.clearStoredAuth(this.platform.is('cordova'));
      }
      console.log('Auth token not found, redirecting to /auth/signin');
      this.router.navigate(['/auth/signin']);
      return false;
    }
  }
}
