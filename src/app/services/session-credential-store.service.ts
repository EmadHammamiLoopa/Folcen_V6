/**
 * Shared synchronous credential state used by consumers that cannot
 * depend directly on asynchronous NativeStorage reads.
 *
 * This store owns:
 *   - safe local token read/write mechanics
 *   - the single in-memory token fallback cache
 *   - startup token restoration from local/native persistence
 *   - authenticated token publication after sign-in/sign-up
 *
 * Interceptor orchestration, socket lifecycle, user persistence, and
 * authoritative session invalidation remain outside this store.
 */
export class SessionCredentialStore {
  private static tokenCache: string | null = null;

  static readLocalToken(): string | null {
    try {
      return localStorage.getItem('token');
    } catch (_) {
      return null;
    }
  }

  static writeLocalToken(
    token: string | null
  ): void {
    try {
      if (token) {
        localStorage.setItem(
          'token',
          token
        );
      } else {
        localStorage.removeItem(
          'token'
        );
      }
    } catch (_) {}
  }

  static setCachedToken(
    token: string | null
  ): void {
    SessionCredentialStore.tokenCache =
      token || null;
  }

  static getCachedToken(): string | null {
    return SessionCredentialStore.tokenCache;
  }

  /**
   * Publish a newly authenticated token into the authoritative
   * credential state.
   *
   * Preserve the current authentication semantics:
   *   1. Cordova NativeStorage is written first when enabled;
   *   2. a NativeStorage failure rejects before local/cache publication;
   *   3. localStorage persistence remains best-effort;
   *   4. the shared synchronous cache is always populated after the
   *      native persistence boundary succeeds.
   */
  static async publishAuthenticatedToken(
    token: string,
    nativeStorage: {
      setItem(
        key: string,
        value: any
      ): Promise<any>;
    },
    persistNative: boolean
  ): Promise<void> {
    const tokenValue =
      typeof token === 'string'
        ? token
        : String(token);

    if (persistNative) {
      await nativeStorage.setItem(
        'token',
        tokenValue
      );
    }

    SessionCredentialStore.writeLocalToken(
      tokenValue
    );

    SessionCredentialStore.setCachedToken(
      tokenValue
    );
  }

  /**
   * Restore the persisted token during application startup.
   *
   * Preserve the existing AppComponent semantics:
   *   1. localStorage wins when populated;
   *   2. NativeStorage is consulted only when local storage is empty;
   *   3. a NativeStorage token is backfilled into localStorage;
   *   4. no persisted token resolves to null.
   *
   * Cache/socket publication intentionally remains with the caller so
   * startup sequencing stays unchanged.
   */
  static async restoreStartupToken(
    nativeStorage: {
      getItem(key: string): Promise<any>;
    }
  ): Promise<string | null> {
    const localToken =
      SessionCredentialStore.readLocalToken();

    if (localToken) {
      return localToken;
    }

    let nativeToken: any = null;

    try {
      nativeToken =
        await nativeStorage.getItem(
          'token'
        );
    } catch (_) {
      nativeToken = null;
    }

    if (!nativeToken) {
      return null;
    }

    const token =
      typeof nativeToken === 'string'
        ? nativeToken
        : String(nativeToken);

    SessionCredentialStore.writeLocalToken(
      token
    );

    return token;
  }

  static readSynchronousToken(): string | null {
    return (
      SessionCredentialStore.readLocalToken() ||
      SessionCredentialStore.getCachedToken()
    );
  }
}
