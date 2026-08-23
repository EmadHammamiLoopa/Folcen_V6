import { Injectable } from '@angular/core';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { SessionCredentialStore } from './session-credential-store.service';

/**
 * Low-level persisted authentication state mechanics shared by route guards.
 *
 * This class deliberately does NOT own route policy, global logout,
 * session invalidation, token caching, or application bootstrap.
 */
@Injectable()
export class SessionAuthStateService {
  constructor(private nativeStorage: NativeStorage) {}

  parseJwtPayload(token: string): any | null {
    try {
      const parts = token?.split('.') || [];
      if (parts.length < 2) {
        return null;
      }

      const normalized = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      const padded =
        normalized +
        '='.repeat((4 - (normalized.length % 4)) % 4);

      return JSON.parse(atob(padded));
    } catch (e) {
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    const payload = this.parseJwtPayload(token);

    if (!payload || !payload.exp) {
      return true;
    }

    return Date.now() >= Number(payload.exp) * 1000;
  }

  getLocalToken(): string | null {
    return localStorage.getItem('token');
  }

  static readLocalUserRaw(): string | null {
    return (
      localStorage.getItem('currentUser') ||
      localStorage.getItem('user')
    );
  }

  getLocalUserRaw(): string | null {
    return SessionAuthStateService
      .readLocalUserRaw();
  }

  getNativeToken(): Promise<any> {
    return this.nativeStorage.getItem('token');
  }

  /**
   * Preserve the existing guard semantics:
   * legacy "user" is consulted only if reading "currentUser" rejects.
   */
  async getNativeUser(): Promise<any> {
    try {
      return await this.nativeStorage.getItem('currentUser');
    } catch (e) {
      try {
        return await this.nativeStorage.getItem('user');
      } catch (e2) {
        return null;
      }
    }
  }

  async persistCurrentUser(
    user: any,
    includeNative: boolean
  ): Promise<void> {
    try {
      localStorage.setItem(
        'currentUser',
        JSON.stringify(user)
      );
    } catch (e) {}

    try {
      localStorage.setItem(
        'user',
        JSON.stringify(user)
      );
    } catch (e) {}

    if (includeNative) {
      try {
        await this.nativeStorage.setItem(
          'currentUser',
          user
        );
      } catch (e) {}

      try {
        await this.nativeStorage.setItem(
          'user',
          user
        );
      } catch (e) {}
    }
  }

  /**
   * Targeted guard cleanup only.
   *
   * This is intentionally NOT the application's authoritative/full logout.
   */
  async clearStoredAuth(
    includeNative: boolean
  ): Promise<void> {
    try {
      localStorage.removeItem('token');
    } catch (e) {}

    // A targeted guard rejection must also invalidate the shared
    // synchronous fallback credential. Otherwise request/socket
    // consumers could continue using a token removed from persistence.
    SessionCredentialStore.setCachedToken(
      null
    );

    try {
      localStorage.removeItem('currentUser');
    } catch (e) {}

    try {
      localStorage.removeItem('user');
    } catch (e) {}

    if (includeNative) {
      try {
        await this.nativeStorage.remove('token');
      } catch (e) {}

      try {
        await this.nativeStorage.remove('currentUser');
      } catch (e) {}

      try {
        await this.nativeStorage.remove('user');
      } catch (e) {}
    }
  }
}
