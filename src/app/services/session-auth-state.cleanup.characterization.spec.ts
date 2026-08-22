import { SessionAuthStateService } from './session-auth-state.service';
import { SessionCredentialStore } from './session-credential-store.service';

describe(
  'SessionAuthStateService targeted cleanup characterization',
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
      'browser cleanup removes persisted token and user keys without consulting NativeStorage',
      async () => {
        localStorage.setItem(
          'token',
          'browser-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"id":"browser-user"}'
        );

        localStorage.setItem(
          'user',
          '{"id":"legacy-browser-user"}'
        );

        await service.clearStoredAuth(
          false
        );

        expect(
          localStorage.getItem('token')
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem('user')
        ).toBeNull();

        expect(
          nativeStorage.remove
        ).not.toHaveBeenCalled();
      }
    );

    it(
      'Cordova cleanup removes the same persisted auth keys from local and native storage',
      async () => {
        localStorage.setItem(
          'token',
          'cordova-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"id":"cordova-user"}'
        );

        localStorage.setItem(
          'user',
          '{"id":"legacy-cordova-user"}'
        );

        await service.clearStoredAuth(
          true
        );

        expect(
          localStorage.getItem('token')
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem('user')
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

    it(
      'Cordova cleanup tolerates one native removal failure and still attempts the remaining keys',
      async () => {
        nativeStorage.remove
          .and.callFake(
            (key: string) =>
              key === 'token'
                ? Promise.reject(
                    new Error(
                      'token remove failed'
                    )
                  )
                : Promise.resolve()
          );

        await expectAsync(
          service.clearStoredAuth(true)
        ).toBeResolved();

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
