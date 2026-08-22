import { SocketService } from './socket.service';
import { SessionCredentialStore } from './session-credential-store.service';

describe(
  'SocketService logout shared credential invalidation',
  () => {
    function tokenFor(
      userId: string
    ): string {
      const header =
        btoa(
          JSON.stringify({
            alg: 'none'
          })
        ).replace(/=/g, '');

      const payload =
        btoa(
          JSON.stringify({
            id: userId
          })
        ).replace(/=/g, '');

      return (
        `${header}.` +
        `${payload}.signature`
      );
    }

    beforeEach(async () => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);

      await SocketService
        .logout()
        .catch(() => undefined);

      SessionCredentialStore
        .setCachedToken(null);
    });

    afterEach(async () => {
      await SocketService
        .logout()
        .catch(() => undefined);

      SessionCredentialStore
        .setCachedToken(null);

      localStorage.clear();
    });

    it(
      'logout releases an owner derived only from the shared fallback token',
      async () => {
        SessionCredentialStore
          .setCachedToken(
            tokenFor(
              'cached-owner'
            )
          );

        localStorage.removeItem(
          'token'
        );

        expect(
          SocketService.getOwnerId()
        ).toBe(
          'cached-owner'
        );

        await SocketService.logout();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBeNull();

        expect(
          SocketService.getOwnerId()
        ).toBeNull();
      }
    );

    it(
      'logout clears both persisted and shared token sources',
      async () => {
        localStorage.setItem(
          'token',
          tokenFor(
            'local-owner'
          )
        );

        SessionCredentialStore
          .setCachedToken(
            tokenFor(
              'cached-owner'
            )
          );

        await SocketService.logout();

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBeNull();

        expect(
          SocketService.getOwnerId()
        ).toBeNull();
      }
    );
  }
);
