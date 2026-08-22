import { SigninComponent } from './signin.component';
import { SocketService } from 'src/app/services/socket.service';
import { SessionCredentialStore } from 'src/app/services/session-credential-store.service';

describe(
  'SigninComponent stale authentication cleanup characterization',
  () => {
    let component: any;
    let nativeStorage: any;
    let platform: any;
    let socketLogoutSpy: jasmine.Spy;

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

      platform = {
        is: jasmine
          .createSpy('is')
          .and.returnValue(false)
      };

      // Deliberately bypass Angular construction.
      // clearStaleAuthData depends only on Platform,
      // NativeStorage, localStorage and SocketService.
      component = Object.create(
        SigninComponent.prototype
      ) as any;

      component.nativeStorage =
        nativeStorage;

      component.platform =
        platform;

      socketLogoutSpy =
        spyOn(
          SocketService,
          'logout'
        ).and.callFake(
          async () => {
            localStorage.removeItem(
              'token'
            );

            SessionCredentialStore
              .setCachedToken(null);
          }
        );
    });

    afterEach(() => {
      localStorage.clear();

      SessionCredentialStore
        .setCachedToken(null);
    });

    it(
      'browser stale cleanup removes local auth and tears down socket state without native removals',
      async () => {
        localStorage.setItem(
          'token',
          'browser-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"browser-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-browser-user"}'
        );

        SessionCredentialStore
          .setCachedToken(
            'cached-browser-token'
          );

        await component
          .clearStaleAuthData();

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          nativeStorage.remove
        ).not.toHaveBeenCalled();

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'Cordova stale cleanup removes token and both user keys from native and local persistence before socket teardown completes',
      async () => {
        platform.is
          .and.callFake(
            (name: string) =>
              name === 'cordova'
          );

        localStorage.setItem(
          'token',
          'cordova-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"cordova-user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-cordova-user"}'
        );

        SessionCredentialStore
          .setCachedToken(
            'cached-cordova-token'
          );

        await component
          .clearStaleAuthData();

        expect(
          nativeStorage.remove.calls.allArgs()
        ).toEqual([
          ['token'],
          ['currentUser'],
          ['user']
        ]);

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      'Cordova stale cleanup tolerates native removal failures and still clears local and socket credential state',
      async () => {
        platform.is
          .and.returnValue(true);

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

        localStorage.setItem(
          'token',
          'persisted-token'
        );

        localStorage.setItem(
          'currentUser',
          '{"_id":"user"}'
        );

        localStorage.setItem(
          'user',
          '{"_id":"legacy-user"}'
        );

        SessionCredentialStore
          .setCachedToken(
            'cached-token'
          );

        await expectAsync(
          component
            .clearStaleAuthData()
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

        expect(
          localStorage.getItem(
            'token'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'currentUser'
          )
        ).toBeNull();

        expect(
          localStorage.getItem(
            'user'
          )
        ).toBeNull();

        expect(
          SessionCredentialStore
            .getCachedToken()
        ).toBeNull();

        expect(
          socketLogoutSpy
        ).toHaveBeenCalledTimes(1);
      }
    );
  }
);
