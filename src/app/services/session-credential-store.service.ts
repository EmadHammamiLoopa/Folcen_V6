/**
 * Shared synchronous credential state used by consumers that cannot
 * depend directly on asynchronous NativeStorage reads.
 *
 * This store owns:
 *   - safe local token read/write mechanics
 *   - raw platform-scoped token reads for consumers whose existing
 *     platform policy must not introduce fallback or backfill
 *   - the single in-memory token fallback cache
 *   - persisted token reads/backfill for startup and request consumers
 *   - authenticated token publication after sign-in/sign-up
 *
 * Interceptor orchestration, socket lifecycle, user persistence, and
 * authoritative session invalidation remain outside this store.
 */
export class SessionCredentialStore {
  private static tokenCache: string | null = null;

  /**
   * Raw persisted local-token read for callers whose existing
   * error/fallback policy must remain unchanged.
   *
   * Deliberately performs no error swallowing, fallback,
   * cache lookup, or persistence mutation.
   */
  static readLocalTokenRaw(): string | null {
    return localStorage.getItem('token');
  }

  private static readNativeTokenRaw(
    nativeStorage: {
      getItem(key: string): Promise<any>;
    }
  ): Promise<any> {
    return nativeStorage.getItem('token');
  }

  static readLocalToken(): string | null {
    try {
      return SessionCredentialStore
        .readLocalTokenRaw();
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
   * Read the token from exactly the platform selected by the caller.
   *
   * This deliberately performs:
   *   - no native/local fallback;
   *   - no local backfill;
   *   - no cache publication;
   *   - no error swallowing.
   *
   * Those semantics preserve consumers such as video authentication
   * where Cordova historically reads NativeStorage only and browser
   * historically reads localStorage only.
   */
  static readPlatformScopedToken(
    nativeStorage: {
      getItem(key: string): Promise<any>;
    },
    useNativeStorage: boolean
  ): Promise<any> | string | null {
    if (useNativeStorage) {
      return SessionCredentialStore
        .readNativeTokenRaw(
          nativeStorage
        );
    }

    return SessionCredentialStore
      .readLocalTokenRaw();
  }

  /**
   * Read a token from NativeStorage and backfill local persistence.
   *
   * Error policy intentionally belongs to the caller:
   * startup swallows an unavailable native store, while request
   * interception retains its existing diagnostic logging.
   */
  static async readNativeTokenAndBackfill(
    nativeStorage: {
      getItem(key: string): Promise<any>;
    }
  ): Promise<string | null> {
    const nativeToken =
      await SessionCredentialStore
        .readNativeTokenRaw(
          nativeStorage
        );

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

    try {
      return await SessionCredentialStore
        .readNativeTokenAndBackfill(
          nativeStorage
        );
    } catch (_) {
      return null;
    }
  }

  static readSynchronousToken(): string | null {
    return (
      SessionCredentialStore.readLocalToken() ||
      SessionCredentialStore.getCachedToken()
    );
  }
}
