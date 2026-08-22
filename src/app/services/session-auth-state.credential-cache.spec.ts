import { SessionAuthStateService } from './session-auth-state.service';
import { SessionCredentialStore } from './session-credential-store.service';

describe(
  'SessionAuthStateService shared credential invalidation',
  () => {
    let nativeStorage: any;
    let service: SessionAuthStateService;

    beforeEach(() => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);

      nativeStorage = {
        remove: jasmine
          .createSpy('remove')
          .and.returnValue(
            Promise.resolve()
          )
      };

      service =
        new SessionAuthStateService(
          nativeStorage
        );
    });

    afterEach(() => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);
    });

    it(
      'browser targeted cleanup invalidates the shared fallback token',
      async () => {
        SessionCredentialStore
          .setCachedToken(
            'cached-browser-token'
          );

        localStorage.removeItem(
          'token'
        );

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBe(
          'cached-browser-token'
        );

        await service.clearStoredAuth(
          false
        );

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBeNull();

        expect(
          nativeStorage.remove
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'Cordova targeted cleanup invalidates the shared token even when native token removal fails',
      async () => {
        nativeStorage.remove
          .and.callFake(
            (key: string) =>
              key === 'token'
                ? Promise.reject(
                    new Error(
                      'native token removal failed'
                    )
                  )
                : Promise.resolve()
          );

        SessionCredentialStore
          .setCachedToken(
            'cached-cordova-token'
          );

        await expectAsync(
          service.clearStoredAuth(
            true
          )
        ).toBeResolved();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          SessionCredentialStore
            .readSynchronousToken()
        ).toBeNull();

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'token'
        );

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'currentUser'
        );

        expect(
          nativeStorage.remove
        ).toHaveBeenCalledWith(
          'user'
        );
      }
    );
  }
);
