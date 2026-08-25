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

  /**
   * Native identity fallback for callers whose existing behavior is:
   * canonical currentUser first, then legacy user whenever the canonical
   * value is falsy. Each NativeStorage read failure is swallowed.
   *
   * This is intentionally distinct from getNativeUser(), whose legacy
   * fallback occurs only when reading currentUser rejects.
   */
  static async readNativeUserFalsyFallback(
    nativeStorage: NativeStorage
  ): Promise<any> {
    let user: any = null;

    try {
      user = await nativeStorage.getItem('currentUser');
    } catch (e) {}

    if (!user) {
      try {
        user = await nativeStorage.getItem('user');
      } catch (e) {}
    }

    return user;
  }

  /**
   * Read only the canonical native currentUser key.
   *
   * A NativeStorage read failure is swallowed and represented as null.
   * This owner deliberately does not consult the legacy native user key.
   */
  static async readNativeCurrentUser(
    nativeStorage: NativeStorage
  ): Promise<any> {
    try {
      return await nativeStorage.getItem('currentUser');
    } catch (e) {
      return null;
    }
  }

  /**
   * Read only the canonical native currentUser key without altering
   * the NativeStorage Promise.
   *
   * Rejection is intentionally preserved for callers whose existing
   * control flow distinguishes a rejected read from a fulfilled
   * falsy value.
   */
  static readNativeCurrentUserRaw(
    nativeStorage: NativeStorage
  ): Promise<any> {
    return nativeStorage.getItem('currentUser');
  }

  /**
   * Read only the legacy native user key.
   *
   * Rejection is intentionally preserved for callers whose existing
   * behavior distinguishes a rejected NativeStorage read from a
   * fulfilled falsy value.
   */
  static readNativeLegacyUser(
    nativeStorage: NativeStorage
  ): Promise<any> {
    return nativeStorage.getItem('user');
  }

  /**
   * Native identity fallback for legacy callers that historically retry
   * canonical currentUser once when its first value is falsy, then consult
   * legacy user only if the retry also produces no user.
   *
   * Every NativeStorage read failure is swallowed independently.
   * This behavior is intentionally distinct from both getNativeUser()
   * and readNativeUserFalsyFallback().
   */
  static async readNativeUserRetryCanonicalFallback(
    nativeStorage: NativeStorage
  ): Promise<any> {
    let user: any = null;

    try {
      user = await nativeStorage.getItem('currentUser');
    } catch (e) {}

    if (!user) {
      try {
        user = await nativeStorage.getItem('currentUser');
      } catch (e) {}
    }

    if (!user) {
      try {
        user = await nativeStorage.getItem('user');
      } catch (e) {}
    }

    return user;
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

  /**
   * Preserve the Signin browser fallback local identity semantics:
   * write the already-serialized user JSON to currentUser first,
   * then to legacy user, swallowing each localStorage failure
   * independently.
   *
   * Serialization deliberately remains owned by the caller.
   */
  static writeLocalUserJsonPair(
    userData: string
  ): void {
    try {
      localStorage.setItem(
        'currentUser',
        userData
      );
    } catch (e) {}

    try {
      localStorage.setItem(
        'user',
        userData
      );
    } catch (e) {}
  }

  /**
   * Preserve UserService native identity publication semantics:
   * publish raw user objects to canonical and legacy keys without
   * awaiting either write. Synchronous throws and Promise rejections
   * are swallowed independently so the caller can continue local,
   * cache, and in-memory publication immediately.
   */
  static writeNativeUserRawPairFireAndForget(
    nativeStorage: NativeStorage,
    user: any
  ): void {
    try {
      nativeStorage
        .setItem('currentUser', user)
        .catch(() => {});
    } catch (_) {}

    try {
      nativeStorage
        .setItem('user', user)
        .catch(() => {});
    } catch (_) {}
  }

  /**
   * Preserve the Signup Cordova fallback write semantics:
   * write only the already-serialized user JSON to currentUser,
   * await that write, and swallow NativeStorage failure.
   *
   * Legacy "user" is intentionally not written here.
   * Serialization deliberately remains owned by the caller.
   */
  static async writeNativeCurrentUserJsonSequential(
    nativeStorage: NativeStorage,
    userData: string
  ): Promise<void> {
    try {
      await nativeStorage.setItem(
        'currentUser',
        userData
      );
    } catch (e) {}
  }

  /**
   * Preserve the Signin Cordova fallback write semantics:
   * write the already-serialized user JSON to currentUser first,
   * then to legacy user, awaiting each write sequentially while
   * swallowing each NativeStorage failure independently.
   *
   * Serialization deliberately remains owned by the caller.
   */
  static async writeNativeUserJsonPairSequential(
    nativeStorage: NativeStorage,
    userData: string
  ): Promise<void> {
    try {
      await nativeStorage.setItem(
        'currentUser',
        userData
      );
    } catch (e) {}

    try {
      await nativeStorage.setItem(
        'user',
        userData
      );
    } catch (e) {}
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
