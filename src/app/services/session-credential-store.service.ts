/**
 * Shared synchronous credential state used by consumers that cannot
 * depend directly on asynchronous NativeStorage reads.
 *
 * This store owns:
 *   - safe local token read/write mechanics
 *   - the single in-memory token fallback cache
 *   - startup token restoration from local/native persistence
 *
 * Login/signup publication, interceptor orchestration, socket lifecycle,
 * and authoritative session invalidation remain outside this store.
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
