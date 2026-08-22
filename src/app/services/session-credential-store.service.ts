/**
 * Shared synchronous credential state used by consumers that cannot
 * depend directly on asynchronous NativeStorage reads.
 *
 * Persistence policy remains with the existing consumers for now.
 * This store owns only:
 *   - safe local token read/write mechanics
 *   - the single in-memory token fallback cache
 *
 * NativeStorage ownership, login/signup publication, and interceptor
 * orchestration are intentionally left unchanged in this phase.
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

  static readSynchronousToken(): string | null {
    return (
      SessionCredentialStore.readLocalToken() ||
      SessionCredentialStore.getCachedToken()
    );
  }
}
